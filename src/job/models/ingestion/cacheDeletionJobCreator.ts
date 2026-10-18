import type { Logger } from '@map-colonies/js-logger';
import type { MultiPolygon, Polygon, Position } from 'geojson';
import { booleanPointInPolygon } from '@turf/turf';
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
const GRID_MIN_LON = -180;
const GRID_MIN_LAT = -90;
const SUBTILES_PER_AXIS = 2;
/** the geodetic grid has two root tiles at zoom 0: the west (x=0) and the east (x=1) hemisphere */
const ROOT_TILES_X = [0, 1];

interface TileBounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** how a tile relates to one footprint, from the edges of the footprint that cross the tile's parent */
interface FootprintEdges {
  footprint: Polygon | MultiPolygon;
  edges: Edge[];
}

/** bounds of a tile on the WorldCRS84 grid: tiles span 180 / 2^zoom degrees from the south-west corner */
const tileBounds = (zoom: number, x: number, y: number): TileBounds => {
  const side = degreesPerTile(zoom);
  const minLon = GRID_MIN_LON + x * side;
  const minLat = GRID_MIN_LAT + y * side;
  return { minLon, minLat, maxLon: minLon + side, maxLat: minLat + side };
};

const tileCenter = (bounds: TileBounds): Position => [
  (bounds.minLon + bounds.maxLon) / SUBTILES_PER_AXIS,
  (bounds.minLat + bounds.maxLat) / SUBTILES_PER_AXIS,
];

/** the edges of every ring of a footprint; rings are closed, so each point joins the next */
const edgesOf = (footprint: Polygon | MultiPolygon): Edge[] => {
  const rings = footprint.type === 'Polygon' ? footprint.coordinates : footprint.coordinates.flat();
  return rings.flatMap((ring) =>
    ring.slice(1).map((point, i) => ({ x1: ring[i]![0] as number, y1: ring[i]![1] as number, x2: point[0] as number, y2: point[1] as number }))
  );
};

/**
 * Liang-Barsky clipping as a yes/no: does any part of the edge lie within the tile? The edge is
 * `start + t * (dx, dy)` for t in [0, 1]; each of the four tile borders narrows the window [t0, t1] of
 * the part inside, and an empty window means a miss. Touching a border counts as inside
 */
const edgeCrossesTile = (edge: Edge, bounds: TileBounds): boolean => {
  const dx = edge.x2 - edge.x1;
  const dy = edge.y2 - edge.y1;
  const speedTowardBorder = [-dx, dx, -dy, dy];
  const distanceInsideBorder = [edge.x1 - bounds.minLon, bounds.maxLon - edge.x1, edge.y1 - bounds.minLat, bounds.maxLat - edge.y1];
  let t0 = 0;
  let t1 = 1;

  for (let i = 0; i < speedTowardBorder.length; i++) {
    const p = speedTowardBorder[i]!;
    const q = distanceInsideBorder[i]!;
    if (p === 0) {
      if (q < 0) {
        return false; // parallel to this border and outside it
      }
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) {
        return false; // enters only after it has already left
      }
      t0 = Math.max(t0, t);
    } else {
      if (t < t0) {
        return false; // leaves before it has entered
      }
      t1 = Math.min(t1, t);
    }
  }
  return true;
};

/** every descendant of a tile down to maxZoom, one range per zoom, by arithmetic alone */
function* subtreeRanges(zoom: number, x: number, y: number, maxZoom: number): Generator<ITileRange> {
  for (let z = zoom; z <= maxZoom; z++) {
    const factor = SUBTILES_PER_AXIS ** (z - zoom);
    yield { zoom: z, minX: x * factor, maxX: (x + 1) * factor - 1, minY: y * factor, maxY: (y + 1) * factor - 1 };
  }
}

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
   * Walks the tile pyramid and keeps only the tiles that touch both the update area and the previous footprint.
   *
   * Only the previous footprint ever had tiles to cache, so a tile of the update area that does not also
   * touch it was never cached and needs no deletion. A tile can touch a footprint only if its parent does,
   * so the walk descends from the two root tiles and drops every tile that misses either area together with
   * all of its descendants. A tile that no edge of a footprint crosses lies wholly inside or wholly outside
   * it, and its centre tells which; a tile wholly inside both areas has every descendant inside both, so its
   * subtree is emitted by arithmetic without being visited. Only the edges that cross a tile are handed to
   * its children, so the work shrinks as the walk narrows onto the boundaries. For an update outside the
   * previous footprint the walk dies out after a few coarse zooms; over an overlap it follows the two
   * boundaries down to maxZoom.
   */
  private *rangesTouchingPreviousFootprint(
    updateArea: Polygon | MultiPolygon,
    previousFootprint: Polygon | MultiPolygon,
    maxZoom: number,
    logger: Logger
  ): Generator<ITileRange> {
    let deepestZoom = -1;

    function* descend(zoom: number, x: number, y: number, areas: FootprintEdges[]): Generator<ITileRange> {
      const bounds = tileBounds(zoom, x, y);
      const crossing = areas.map(({ footprint, edges }) => ({ footprint, edges: edges.filter((edge) => edgeCrossesTile(edge, bounds)) }));
      const uncrossed = crossing.filter(({ edges }) => edges.length === 0);
      if (uncrossed.some(({ footprint }) => !booleanPointInPolygon(tileCenter(bounds), footprint))) {
        return; // wholly outside one of the areas, and so is every descendant
      }
      if (uncrossed.length === areas.length) {
        deepestZoom = maxZoom;
        yield* subtreeRanges(zoom, x, y, maxZoom); // wholly inside both areas, and so is every descendant
        return;
      }

      deepestZoom = Math.max(deepestZoom, zoom);
      yield { zoom, minX: x, maxX: x, minY: y, maxY: y };

      if (zoom < maxZoom) {
        const childX = SUBTILES_PER_AXIS * x;
        const childY = SUBTILES_PER_AXIS * y;
        yield* descend(zoom + 1, childX, childY, crossing);
        yield* descend(zoom + 1, childX + 1, childY, crossing);
        yield* descend(zoom + 1, childX, childY + 1, crossing);
        yield* descend(zoom + 1, childX + 1, childY + 1, crossing);
      }
    }

    const areas: FootprintEdges[] = [
      { footprint: updateArea, edges: edgesOf(updateArea) },
      { footprint: previousFootprint, edges: edgesOf(previousFootprint) },
    ];
    for (const rootX of ROOT_TILES_X) {
      yield* descend(0, rootX, 0, areas);
    }
    logger.info({ msg: 'Cache deletion range walk ended', deepestZoom, maxZoom });
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
