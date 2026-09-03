import type { Logger } from '@map-colonies/js-logger';
import { footprintToTileRanges } from '@map-colonies/mc-utils';
import type { ICreateJobBody, ICreateTaskBody } from '@map-colonies/mc-priority-queue';
import { OperationStatus, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import type { LayerName } from '@map-colonies/raster-shared';
import { GEODETIC_GRIDS, StorageProvider } from '@map-colonies/raster-shared';
import { inject, injectable } from 'tsyringe';
import { context, SpanStatusCode, trace, type Span, type Tracer } from '@opentelemetry/api';
import { LayerCacheType, SERVICES } from '../../../common/constants';
import { UnexpectedCacheGridsError, UnsupportedGridError } from '../../../common/errors';
import type { CacheDeletionJobParams, CacheDeletionTaskConfig, CacheDeletionTaskParams, IConfig } from '../../../common/interfaces';
import { MapproxyApiClient } from '../../../httpClients/mapproxyClient';
import { internalIdSchema } from '../../../utils/zod/schemas/jobParameters.schema';
import { IngestionSwapUpdateFinalizeJob, IngestionUpdateFinalizeJob } from '../../../utils/zod/schemas/job.schema';
import { limitedTileBatchGenerator } from '../../../utils/tileRangeBatcher';
import type { ReadProductGeometry } from '../../../utils/storage/productReader';

type IngestionFinalizeJob = IngestionUpdateFinalizeJob | IngestionSwapUpdateFinalizeJob;
type CacheDeletionTask = ICreateTaskBody<CacheDeletionTaskParams>;

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

  public async create({ layerName, ingestionJob }: CacheDeletionJobParams): Promise<void> {
    await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${CacheDeletionJobCreator.name}.${this.create.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();
      const isSwapUpdate = ingestionJob.type === this.swapUpdateJobType;

      // The job type is what tells cleaner which strategy to run, so it is chosen per flow rather
      // than fixed at construction.
      const jobType = isSwapUpdate ? this.swapCacheDeletionJobType : this.updateCacheDeletionJobType;

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
          cacheDeletionShape: isSwapUpdate ? 'prefix-wipe' : 'range-deletion',
          layerName,
        });

        const prefix = await this.resolvePrefix(layerName, logger);
        const catalogId = internalIdSchema.parse(ingestionJob).internalId;

        const tasks = isSwapUpdate ? this.buildWipeTask(prefix) : this.buildRangeTasks(ingestionJob, prefix, logger);

        await this.createJobWithStreamedTasks(ingestionJob, jobType, catalogId, tasks, logger, activeSpan);
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

  /**
   * Composes the redis key prefix in format `${cacheName}_${gridName}`, matching mapproxy's loader.py behavior.
   * Both parts come from mapproxy-api's cache response, so the grid is not a second source of truth here.
   */
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

    const geometry = await this.readProductGeometry(job.parameters.inputFiles.productShapefilePath);
    logger.info({ msg: 'Computing tile ranges over the updated footprint', maxZoom, tileBatchSize, maxRangesPerTask });

    const ranges = footprintToTileRanges(geometry, { minZoom: 0, maxZoom });

    for await (const batch of limitedTileBatchGenerator(tileBatchSize, maxRangesPerTask, ranges)) {
      yield {
        type: this.taskConfig.type,
        description: 'redis cache range deletion',
        parameters: { storageProvider: StorageProvider.REDIS, prefix, ranges: batch },
      };
    }
  }

  /**
   * Tasks are streamed to avoid memory overhead. The job is created with its first batch
   * so job-tracker never sees an empty job.
   */
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

    try {
      for await (const task of tasks) {
        taskBatch.push(task);
        taskCount++;

        if (taskBatch.length === taskBatchSize) {
          jobId = await this.flushTaskBatch(job, jobType, catalogId, jobId, taskBatch);
          taskBatch = [];
        }
      }

      if (taskBatch.length > 0) {
        jobId = await this.flushTaskBatch(job, jobType, catalogId, jobId, taskBatch);
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
    tasks: CacheDeletionTask[]
  ): Promise<string> {
    if (jobId !== undefined) {
      await this.queueClient.jobManagerClient.createTaskForJob(jobId, tasks);
      return jobId;
    }

    const { resourceId, version, producerName, productName, productType, domain } = job;
    const createJobRequest: ICreateJobBody<unknown, CacheDeletionTaskParams> = {
      resourceId,
      internalId: catalogId,
      version,
      type: jobType,
      parameters: { ingestionJobId: job.id, ingestionJobType: job.type },
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

  /**
   * A job created with its first batch but missing later ones would run its enqueued tasks to
   * completion, and job-tracker would then report the whole cache deletion as successful. Fail it
   * explicitly instead - silent partial success is the failure mode this creator exists to avoid.
   */
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
