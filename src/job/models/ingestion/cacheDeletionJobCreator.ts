import type { Logger } from '@map-colonies/js-logger';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { bbox, buffer, clone, coordEach, feature, featureCollection, intersect } from '@turf/turf';
import { degreesPerTile, footprintToTileRanges } from '@map-colonies/mc-utils';
import type { ITileRange } from '@map-colonies/mc-utils';
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
/** the globe is flat for practical purposes across this many degrees around the equator */
const FLAT_EXTENT_DEGREES = 1;
/**
 * keeps the buffer a superset of the grid distance: turf draws the round ends as polygons inscribed in the
 * circle, which fall short of the radius by up to half a percent, and the flat patch has a little curvature
 */
const FLAT_BUFFER_MARGIN = 1.01;
const HALF = 2;

const midpoint = (a: number, b: number): number => a + (b - a) / HALF;

const mapCoordinates = <G extends Polygon | MultiPolygon>(geometry: G, map: (x: number, y: number) => [number, number]): G => {
  const mapped = clone(geometry);
  coordEach(mapped, (coord) => {
    const [x, y] = map(coord[0] as number, coord[1] as number);
    coord[0] = x;
    coord[1] = y;
  });
  return mapped;
};

/**
 * Buffers a footprint by a distance in grid degrees, the metric of the WorldCRS84 tile grid.
 *
 * turf measures a buffer along the globe, so a buffer of many degrees around a footprint away from the
 * equator bends around the sphere and can even leave the footprint itself outside the result. The footprint
 * is therefore moved to the equator and scaled down to a patch small enough to be flat, buffered there, and
 * mapped back, which makes the buffer planar in degrees as the grid requires.
 */
const bufferInGridDegrees = (footprint: Feature<Polygon | MultiPolygon>, distance: number): Feature<Polygon | MultiPolygon> | undefined => {
  const [minX, minY, maxX, maxY] = bbox(footprint);
  const centerX = midpoint(minX, maxX);
  const centerY = midpoint(minY, maxY);
  // the flat patch has to hold the footprint plus the buffer on both sides
  const scale = FLAT_EXTENT_DEGREES / (Math.max(maxX - minX, maxY - minY) + distance + distance);

  const flat = mapCoordinates(footprint.geometry, (x, y) => [(x - centerX) * scale, (y - centerY) * scale]);
  const buffered = buffer(flat, distance * scale * FLAT_BUFFER_MARGIN, { units: 'degrees' });
  if (buffered === undefined) {
    return undefined;
  }
  return feature(mapCoordinates(buffered.geometry, (x, y) => [x / scale + centerX, y / scale + centerY]));
};

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
   * Walks only the tiles that can hold a cached tile of the replaced data.
   *
   * Only the previous footprint ever had tiles to cache, so a tile of the update area that does not also
   * touch it was never cached and needs no deletion. A tile of side `s` that touches the previous footprint
   * lies within `s * sqrt(2)` of it, so clipping the update area to a buffer of that reach, per zoom, gives a
   * tight superset of the tiles touching both: at most a rim about two tiles wide along the previous
   * boundary. Touching is monotone down the pyramid (a child touching both implies its parent does), so the
   * first zoom with an empty clip ends the walk - for an update outside the previous footprint that happens
   * at a low zoom, leaving just the coarse tiles both areas share.
   */
  private *rangesTouchingPreviousFootprint(
    updateArea: Polygon | MultiPolygon,
    previousFootprint: Polygon | MultiPolygon,
    maxZoom: number,
    logger: Logger
  ): Generator<ITileRange> {
    const update = feature(updateArea);
    const previous = feature(previousFootprint);

    for (let zoom = 0; zoom <= maxZoom; zoom++) {
      const reach = degreesPerTile(zoom) * Math.SQRT2;
      const nearPrevious = bufferInGridDegrees(previous, reach);
      const target = nearPrevious === undefined ? null : intersect(featureCollection([update, nearPrevious]));

      if (target === null) {
        logger.info({ msg: 'Update area stops touching the previous footprint, ending the range walk', lastZoom: zoom - 1, maxZoom });
        return;
      }

      yield* footprintToTileRanges(target, { minZoom: zoom, maxZoom: zoom });
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
