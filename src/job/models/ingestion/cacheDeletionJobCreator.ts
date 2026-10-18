import type { Logger } from '@map-colonies/js-logger';
import type { MultiPolygon, Polygon } from 'geojson';
import { bbox } from '@turf/turf';
import { bboxToTileRange, footprintToTileRanges } from '@map-colonies/mc-utils';
import type { BBox2d, ITileRange } from '@map-colonies/mc-utils';
import type { ICreateJobBody, ICreateTaskBody } from '@map-colonies/mc-priority-queue';
import { OperationStatus, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import type { CacheDeletionJobParams, LayerName } from '@map-colonies/raster-shared';
import { GEODETIC_GRIDS, StorageProvider } from '@map-colonies/raster-shared';
import { inject, injectable } from 'tsyringe';
import { context, SpanStatusCode, trace, type Span, type Tracer } from '@opentelemetry/api';
import { LayerCacheType, SERVICES } from '../../../common/constants';
import { UnexpectedCacheGridsError, UnsupportedGridError } from '../../../common/errors';
import type { CreateCacheDeletionJobParams, CacheDeletionTaskConfig, CacheDeletionTaskParams, IConfig } from '../../../common/interfaces';
import { MapproxyApiClient } from '../../../httpClients/mapproxyClient';
import { internalIdSchema } from '../../../utils/zod/schemas/jobParameters.schema';
import { IngestionSwapUpdateFinalizeJob, IngestionUpdateFinalizeJob } from '../../../utils/zod/schemas/job.schema';
import { limitedTileBatchGenerator } from '../../../utils/tileRangeBatcher';
import type { ReadProductGeometry } from '../../../utils/storage/productReader';

type IngestionFinalizeJob = IngestionUpdateFinalizeJob | IngestionSwapUpdateFinalizeJob;
type CacheDeletionTask = ICreateTaskBody<CacheDeletionTaskParams>;

interface CacheDeletionStrategy {
  jobType: string;
  buildTasks: (prefix: string, logger: Logger) => AsyncGenerator<CacheDeletionTask>;
}

/**
 * Creates the job that deletes a layer's MapProxy redis tile cache after an ingestion.
 *
 * Two strategies:
 *  - swap-update: wipes entire prefix (layer redirects to new tiles path)
 *  - update: deletes specific tile ranges over ingested footprint across all zooms
 */
@injectable()
export class CacheDeletionJobCreator {
  private readonly taskConfig: CacheDeletionTaskConfig;
  private readonly swapUpdateJobType: string;
  private readonly updateCacheDeletionJobType: string;
  private readonly swapCacheDeletionJobType: string;
  private readonly wipeDelaySeconds: number;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.TRACER) private readonly tracer: Tracer,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.QUEUE_CLIENT) private readonly queueClient: QueueClient,
    @inject(MapproxyApiClient) private readonly mapproxyClient: MapproxyApiClient,
    @inject(SERVICES.PRODUCT_READER) private readonly readProductGeometry: ReadProductGeometry
  ) {
    this.taskConfig = this.config.get<CacheDeletionTaskConfig>('jobManagement.ingestion.tasks.cacheDeletion');
    this.swapUpdateJobType = this.config.get<string>('jobManagement.ingestion.pollingJobs.swapUpdate.type');
    this.updateCacheDeletionJobType = this.config.get<string>('jobManagement.ingestion.jobs.updateCacheDeletion.type');
    this.swapCacheDeletionJobType = this.config.get<string>('jobManagement.ingestion.jobs.swapCacheDeletion.type');

    // Serving pods reload config on their own schedule (gracefulReloadMaxSeconds).
    // Delay wiping cache keys until all pods have reloaded to prevent stale pods from re-caching
    // old tiles under removed keys.
    this.wipeDelaySeconds = this.taskConfig.gracefulReloadMaxSeconds + this.taskConfig.reloadWindowMarginSeconds;
  }

  public async create({ layerName, ingestionJob }: CreateCacheDeletionJobParams): Promise<void> {
    await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${CacheDeletionJobCreator.name}.${this.create.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();
      const { jobType, buildTasks } = this.resolveStrategy(ingestionJob);

      const logger = this.logger.child({
        ingestionJobId: ingestionJob.id,
        jobType,
        taskType: this.taskConfig.type,
        layerName,
      });

      try {
        logger.info({ msg: 'Starting cache deletion job creation process' });
        activeSpan?.setAttributes({
          ingestionJobId: ingestionJob.id,
          cacheDeletionJobType: jobType,
          layerName,
        });

        const prefix = await this.resolvePrefix(layerName, logger);
        const catalogId = internalIdSchema.parse(ingestionJob).internalId;

        await this.createJobWithStreamedTasks(ingestionJob, jobType, catalogId, buildTasks(prefix, logger), logger, activeSpan);
      } catch (err) {
        if (err instanceof Error) {
          activeSpan?.recordException(err);
          activeSpan?.setStatus({ code: SpanStatusCode.ERROR });
          logger.error({ msg: `Failed to create cache deletion job: ${err.message}`, err });
        }
      } finally {
        activeSpan?.end();
      }
    });
  }

  private resolveStrategy(ingestionJob: IngestionFinalizeJob): CacheDeletionStrategy {
    if (ingestionJob.type === this.swapUpdateJobType) {
      return {
        jobType: this.swapCacheDeletionJobType,
        buildTasks: (prefix) => this.buildWipeTask(prefix),
      };
    }

    return {
      jobType: this.updateCacheDeletionJobType,
      buildTasks: (prefix, logger) => this.buildRangeTasks(ingestionJob, prefix, logger),
    };
  }

  private async resolvePrefix(layerName: LayerName, logger: Logger): Promise<string> {
    const { cacheName, grids } = await this.mapproxyClient.getRedisCache({ layerName, cacheType: LayerCacheType.REDIS });
    const grid = this.resolveGrid(cacheName, grids);
    const prefix = `${cacheName}_${grid}`;

    logger.info({ msg: 'Composed redis key prefix', cacheName, grid, prefix });
    trace.getActiveSpan()?.setAttributes({ cacheName, grid, redisPrefix: prefix });

    return prefix;
  }

  private resolveGrid(cacheName: string, grids: string[] | undefined): string {
    const grid = grids?.length === 1 ? grids[0] : undefined;
    if (grid === undefined) {
      throw new UnexpectedCacheGridsError(cacheName, grids);
    }
    if (!GEODETIC_GRIDS.includes(grid)) {
      throw new UnsupportedGridError(grid, GEODETIC_GRIDS);
    }

    return grid;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async *buildWipeTask(prefix: string): AsyncGenerator<CacheDeletionTask> {
    yield {
      type: this.taskConfig.type,
      description: 'redis cache prefix wipe',
      parameters: { storageProvider: StorageProvider.REDIS, prefix, delaySeconds: this.wipeDelaySeconds },
    };
  }

  private async *buildRangeTasks(job: IngestionFinalizeJob, prefix: string, logger: Logger): AsyncGenerator<CacheDeletionTask> {
    const { maxZoom, tileBatchSize, maxRangesPerTask } = this.taskConfig;
    const { previousFootprint } = job.parameters.additionalParams;

    const updateArea = await this.readProductGeometry(job.parameters.inputFiles.productShapefilePath);
    logger.info({
      msg: 'Computing tile ranges over the updated footprint',
      maxZoom,
      tileBatchSize,
      maxRangesPerTask,
      restrictedToPreviousFootprint: previousFootprint !== undefined,
    });

    // without the previous footprint (jobs created before init recorded it) every tile of the update area is covered
    const ranges =
      previousFootprint === undefined
        ? footprintToTileRanges(updateArea, { minZoom: 0, maxZoom })
        : this.rangesTouchingPreviousFootprint(updateArea, previousFootprint, maxZoom, logger);

    for await (const batch of limitedTileBatchGenerator(tileBatchSize, maxRangesPerTask, ranges)) {
      yield {
        type: this.taskConfig.type,
        description: 'redis cache range deletion',
        parameters: { storageProvider: StorageProvider.REDIS, prefix, ranges: batch },
      };
    }
  }

  /**
   * Keeps only the update tiles that can also hold a cached tile of the replaced data.
   *
   * Only the previous footprint ever had tiles to cache, so an update tile that lies outside the tile box
   * around it was never cached and needs no deletion. Each zoom clips the update ranges to that box with
   * plain range arithmetic, padded by one tile so tiles that merely touch the previous footprint's edge are
   * kept too. Sharing a tile is monotone down the pyramid (a child shared by both areas has a shared parent),
   * so the first zoom with no shared tile ends the walk - for an update on new ground that happens at a low
   * zoom, leaving just the coarse tiles both areas share.
   */
  private *rangesTouchingPreviousFootprint(
    updateArea: Polygon | MultiPolygon,
    previousFootprint: Polygon | MultiPolygon,
    maxZoom: number,
    logger: Logger
  ): Generator<ITileRange> {
    const [minLon, minLat, maxLon, maxLat] = bbox(previousFootprint);
    const previousBbox: BBox2d = [minLon, minLat, maxLon, maxLat];

    for (let zoom = 0; zoom <= maxZoom; zoom++) {
      const previous = bboxToTileRange(previousBbox, zoom);
      let shared = false;

      for (const range of footprintToTileRanges(updateArea, { minZoom: zoom, maxZoom: zoom })) {
        const clipped: ITileRange = {
          zoom,
          minX: Math.max(range.minX, previous.minX - 1),
          minY: Math.max(range.minY, previous.minY - 1),
          maxX: Math.min(range.maxX, previous.maxX + 1),
          maxY: Math.min(range.maxY, previous.maxY + 1),
        };
        if (clipped.minX <= clipped.maxX && clipped.minY <= clipped.maxY) {
          shared = true;
          yield clipped;
        }
      }

      if (!shared) {
        logger.info({ msg: 'Update area stops sharing tiles with the previous footprint, ending the range walk', lastZoom: zoom - 1, maxZoom });
        return;
      }
    }
  }

  private async createJobWithStreamedTasks(
    job: IngestionFinalizeJob,
    jobType: string,
    catalogId: string,
    tasks: AsyncGenerator<CacheDeletionTask>,
    logger: Logger,
    activeSpan: Span | undefined
  ): Promise<void> {
    const { taskBatchSize } = this.taskConfig;
    let taskBatch: CacheDeletionTask[] = [];
    let jobId: string | undefined;
    let taskCount = 0;
    let isJobCreatedWithAllTasks = false;

    try {
      for await (const task of tasks) {
        taskBatch.push(task);
        taskCount++;

        // A full batch: the first one creates the job, later ones are appended to it.
        // More tasks may still follow, so the job is not flagged as complete yet.
        if (taskBatch.length === taskBatchSize) {
          jobId = await this.flushTaskBatch(job, jobType, catalogId, jobId, taskBatch, false);
          taskBatch = [];
        }
      }

      // The leftover partial batch. If no job exists yet, every task fit in this single batch,
      // so the job is created already flagged as complete and needs no follow-up update.
      if (taskBatch.length > 0) {
        isJobCreatedWithAllTasks = jobId === undefined;
        jobId = await this.flushTaskBatch(job, jobType, catalogId, jobId, taskBatch, true);
      }

      // The job was created by an earlier full batch with the flag unset (tasks were appended
      // afterwards, or the task count was an exact multiple of the batch size), so set it now.
      if (jobId !== undefined && !isJobCreatedWithAllTasks) {
        await this.markTasksCreationCompleted(jobId, job.id);
      }
    } catch (err) {
      if (jobId !== undefined) {
        await this.failPartialJob(jobId, err, logger);
      }
      throw err; // create()'s catch logs and swallows, so ingestion is unaffected
    }

    if (jobId === undefined) {
      logger.warn({ msg: 'No cache deletion tasks produced, skipping job creation' });
      activeSpan?.addEvent('createJob.skipped', { reason: 'No tasks produced' });
      return;
    }

    logger.info({ msg: 'Cache deletion job created successfully', cacheDeletionJobId: jobId, taskCount });
    activeSpan?.setAttributes({ cacheDeletionJobId: jobId, taskCount });
  }

  private async flushTaskBatch(
    job: IngestionFinalizeJob,
    jobType: string,
    catalogId: string,
    jobId: string | undefined,
    tasks: CacheDeletionTask[],
    isLastBatch: boolean
  ): Promise<string> {
    if (jobId !== undefined) {
      await this.queueClient.jobManagerClient.createTaskForJob(jobId, tasks);
      return jobId;
    }

    const { resourceId, version, producerName, productName, productType, domain } = job;
    const createJobRequest: ICreateJobBody<CacheDeletionJobParams, CacheDeletionTaskParams> = {
      resourceId,
      internalId: catalogId,
      version,
      type: jobType,
      parameters: { ingestionJobId: job.id, tasksCreationCompleted: isLastBatch },
      status: OperationStatus.IN_PROGRESS,
      producerName: producerName ?? undefined,
      productName,
      productType,
      domain,
      tasks,
    };

    const res = await this.queueClient.jobManagerClient.createJob(createJobRequest);
    return res.id;
  }

  private async markTasksCreationCompleted(jobId: string, ingestionJobId: string): Promise<void> {
    const parameters: CacheDeletionJobParams = { ingestionJobId, tasksCreationCompleted: true };
    await this.queueClient.jobManagerClient.updateJob(jobId, { parameters });
  }

  private async failPartialJob(jobId: string, cause: unknown, logger: Logger): Promise<void> {
    const reason = `cache deletion task enqueue failed: ${cause instanceof Error ? cause.message : String(cause)}`;
    logger.error({ msg: 'Cache deletion job is missing tasks after an enqueue failure, marking it failed', cacheDeletionJobId: jobId, reason });

    try {
      await this.queueClient.jobManagerClient.updateJob(jobId, { status: OperationStatus.FAILED, reason });
    } catch (updateErr) {
      logger.error({
        msg: 'Could not mark the partial cache deletion job as failed, it may be reported as successful',
        cacheDeletionJobId: jobId,
        err: updateErr,
      });
    }
  }
}
