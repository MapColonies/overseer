import { Logger } from '@map-colonies/js-logger';
import { degreesPerPixelToZoomLevel, getUTCDate, zoomLevelToResolutionDeg, featureToTilesCount } from '@map-colonies/mc-utils';
import { feature } from '@turf/turf';
import { MultiPolygon, Polygon } from 'geojson';
import { ICreateJobBody, ICreateTaskBody, OperationStatus, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { inject, injectable } from 'tsyringe';
import { context, SpanStatusCode, trace, Tracer } from '@opentelemetry/api';
import { LayerCacheType, SeedMode, SERVICES } from '../../../common/constants';
import { Footprint, IConfig, SeedJobParams, SeedTaskOptions, SeedTaskParams, TilesSeedingTaskConfig } from '../../../common/interfaces';
import { MapproxyApiClient } from '../../../httpClients/mapproxyClient';
import { internalIdSchema } from '../../../utils/zod/schemas/jobParameters.schema';
import { IngestionSwapUpdateFinalizeJob, IngestionUpdateFinalizeJob } from '../../../utils/zod/schemas/job.schema';
import { extractMaxUpdateZoomLevel } from '../../../utils/partsDataUtil';
import { unifyParts, splitGeometryByTileCount } from '../../../utils/geoUtils';

@injectable()
export class SeedingJobCreator {
  private readonly tilesSeedingConfig: TilesSeedingTaskConfig;
  private readonly seedJobType: string;
  private readonly zoomThreshold: number;
  private readonly maxZoom: number;
  private readonly maxTilesPerSeedTask: number;
  private readonly maxTilesPerCleanTask: number;
  private readonly updateJobType: string;
  private readonly swapUpdateJobType: string;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.TRACER) private readonly tracer: Tracer,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.QUEUE_CLIENT) protected queueClient: QueueClient,
    @inject(MapproxyApiClient) private readonly mapproxyClient: MapproxyApiClient
  ) {
    this.tilesSeedingConfig = this.config.get<TilesSeedingTaskConfig>('jobManagement.ingestion.tasks.tilesSeeding');
    this.seedJobType = this.config.get<string>('jobManagement.ingestion.jobs.seed.type');
    this.zoomThreshold = this.config.get<number>('jobManagement.ingestion.tasks.tilesSeeding.zoomThreshold');
    this.maxTilesPerSeedTask = this.config.get<number>('jobManagement.ingestion.tasks.tilesSeeding.maxTilesPerSeedTask');
    this.maxTilesPerCleanTask = this.config.get<number>('jobManagement.ingestion.tasks.tilesSeeding.maxTilesPerCleanTask');
    this.updateJobType = this.config.get<string>('jobManagement.ingestion.pollingJobs.update.type');
    this.swapUpdateJobType = this.config.get<string>('jobManagement.ingestion.pollingJobs.swapUpdate.type');
    this.maxZoom = this.config.get<number>('jobManagement.ingestion.tasks.tilesSeeding.maxZoom');
  }

  public async create({ layerName, ingestionJob }: SeedJobParams): Promise<void> {
    await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${SeedingJobCreator.name}.${this.create.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();
      try {
        const { type: seedTaskType } = this.tilesSeedingConfig;

        const logger = this.logger.child({ ingestionJobId: ingestionJob.id, jobType: this.seedJobType, taskType: seedTaskType });
        logger.info({ msg: 'Starting seeding job creation process' });

        activeSpan?.setAttributes({
          ingestionJobId: ingestionJob.id,
          seedJobType: this.seedJobType,
          seedTaskType,
          layerName,
        });

        logger.debug({ msg: 'Getting cache name for layer', layerName });

        const cacheName = await this.mapproxyClient.getCacheName({ layerName, cacheType: LayerCacheType.REDIS });
        activeSpan?.addEvent('getCacheName.success', { cacheName });

        const validCatalogId = internalIdSchema.parse(ingestionJob).internalId;

        const seedTasks: ICreateTaskBody<SeedTaskParams>[] = [];

        // Handle different modes
        const cleanModeTasks = this.handleCleanMode(ingestionJob, cacheName, validCatalogId);
        const seedModeTasks = this.handleSeedMode(ingestionJob, cacheName, validCatalogId);

        seedTasks.push(...cleanModeTasks);
        seedTasks.push(...seedModeTasks);

        if (seedTasks.length === 0) {
          logger.warn({ msg: 'No tasks created, skipping job creation' });
          activeSpan?.addEvent('createJob.skipped', { reason: 'No tasks created' });
          return;
        }

        const { resourceId, version, producerName, productType, domain, productName } = ingestionJob;
        const createJobRequest: ICreateJobBody<unknown, SeedTaskParams> = {
          resourceId,
          internalId: validCatalogId,
          version,
          type: this.seedJobType,
          parameters: {},
          status: OperationStatus.IN_PROGRESS,
          producerName: producerName ?? undefined,
          productName: productName ?? undefined,
          productType,
          domain,
          tasks: seedTasks,
        };

        const res = await this.queueClient.jobManagerClient.createJob(createJobRequest);
        activeSpan?.addEvent('createJob.success', { seedJobId: res.id });
        logger.info({ msg: 'Seeding job created successfully', seedJobId: res.id, seedTaskIds: res.taskIds });
      } catch (err) {
        if (err instanceof Error) {
          activeSpan?.recordException(err);
          activeSpan?.setStatus({ code: SpanStatusCode.ERROR });
          return this.logger.error({ msg: `Failed to create seeding job: ${err.message}`, error: err });
        }
      } finally {
        activeSpan?.end();
      }
    });
  }

  private handleCleanMode(
    job: IngestionUpdateFinalizeJob | IngestionSwapUpdateFinalizeJob,
    cacheName: string,
    catalogId: string
  ): ICreateTaskBody<SeedTaskParams>[] {
    const activeSpan = trace.getActiveSpan();
    const seedTasks: ICreateTaskBody<SeedTaskParams>[] = [];
    const seedTaskType = this.tilesSeedingConfig.type;
    const logger = this.logger.child({ mode: SeedMode.CLEAN, jobId: job.id, catalogId: job.internalId });

    const cleanGeometry = this.calculateGeometryByMode(SeedMode.CLEAN, job);
    if (!cleanGeometry) {
      activeSpan?.addEvent('calculateCleanGeometry.empty');
      logger.warn({ msg: 'No geometry found for CLEAN mode' });
      return [];
    }

    activeSpan?.addEvent('calculateCleanGeometry.success', { geometry: JSON.stringify(cleanGeometry) });

    if (job.type === this.swapUpdateJobType) {
      const cleanOptions = this.createSeedOptions(SeedMode.CLEAN, cleanGeometry, cacheName);
      activeSpan?.addEvent('createSeedOptions.success', { seedOptions: JSON.stringify(cleanOptions) });

      const taskParams = this.createTaskParams(catalogId, cleanOptions);
      activeSpan?.addEvent('createTaskParams.success', { taskParams: JSON.stringify(taskParams) });

      seedTasks.push({ type: seedTaskType, parameters: taskParams });
    } else if (job.type === this.updateJobType) {
      const maxUpdateZoomLevel = extractMaxUpdateZoomLevel(job.parameters.partsData);
      if (maxUpdateZoomLevel + 1 <= this.maxZoom) {
        const cleanOptions = this.createSeedOptions(SeedMode.CLEAN, cleanGeometry, cacheName, maxUpdateZoomLevel + 1);
        activeSpan?.addEvent('createSeedOptions.success', { seedOptions: JSON.stringify(cleanOptions) });

        const taskParams = this.createTaskParams(catalogId, cleanOptions);
        activeSpan?.addEvent('createTaskParams.success', { taskParams: JSON.stringify(taskParams) });

        seedTasks.push({ type: seedTaskType, parameters: taskParams });
      }
    }
    return seedTasks;

    //TODO: add this when we would want to seperate both clean tasks by zoom and maxTilesCount
    /** 
     *  const maxUpdatedZoom = extractMaxUpdateZoomLevel(job);
    const startCleanZoom: number = job.type === this.swapUpdateJobType ? this.zoomThreshold + 1 : maxUpdatedZoom + 1;

    // For swap update, create a base task from 0 to zoomThreshold
    if (job.type === this.swapUpdateJobType) {
      const cleanOptions = this.createSeedOptions(SeedMode.CLEAN, cleanGeometry, cacheName, 0, this.zoomThreshold);
      activeSpan?.addEvent('createSeedOptions.success', { seedOptions: JSON.stringify(cleanOptions) });

      const taskParams = this.createTaskParams(catalogId, cleanOptions);
      activeSpan?.addEvent('createTaskParams.success', { taskParams: JSON.stringify(taskParams) });
      seedTasks.push({ type: seedTaskType, parameters: taskParams });
    }

    // For both swap and update, create tasks for high-resolution zoom levels if needed
    for (let zoom = startCleanZoom; zoom <= this.maxZoom; zoom++) {
      const estimatedTiles = featureToTilesCount(feature(cleanGeometry), zoom);

      if (estimatedTiles <= this.maxTilesPerCleanTask) {
        // If tiles count is within limit, create a single task
        const options = this.createSeedOptions(SeedMode.CLEAN, cleanGeometry, cacheName, zoom, zoom);
        const taskParams = this.createTaskParams(catalogId, options);
        seedTasks.push({ type: seedTaskType, parameters: taskParams });
      } else {
        // If tiles count exceeds limit, split the geometry
        const splitGeometries = this.splitGeometryByTileCount(cleanGeometry, zoom, this.maxTilesPerCleanTask);
        for (const geometry of splitGeometries) {
          const options = this.createSeedOptions(SeedMode.CLEAN, geometry, cacheName, zoom, zoom);
          const taskParams = this.createTaskParams(catalogId, options);
          seedTasks.push({ type: seedTaskType, parameters: taskParams });
        }
      }
    }

    return seedTasks;
     */
  }

  private handleSeedMode(
    job: IngestionUpdateFinalizeJob | IngestionSwapUpdateFinalizeJob,
    cacheName: string,
    catalogId: string
  ): ICreateTaskBody<SeedTaskParams>[] {
    const activeSpan = trace.getActiveSpan();
    const seedTasks: ICreateTaskBody<SeedTaskParams>[] = [];
    const seedTaskType = this.tilesSeedingConfig.type;

    if (job.type !== this.updateJobType) {
      this.logger.debug({ msg: 'Ingestion Job is not of update type, skipping SEED creation' });
      activeSpan?.addEvent('handleSeedMode.skipped');
      return [];
    }

    const seedGeometry = this.calculateGeometryByMode(SeedMode.SEED, job);
    if (!seedGeometry) {
      activeSpan?.addEvent('calculateSeedGeometry.empty');
      this.logger.warn({ msg: 'No geometry found for SEED mode' });
      return [];
    }

    const partsData = job.parameters.partsData;
    const thresholdZoom =
      zoomLevelToResolutionDeg(this.zoomThreshold) ??
      ((): never => {
        throw new Error(`Failed to calculate resolution for zoom threshold: ${this.zoomThreshold}`);
      })();
    const highZoomParts = partsData.filter((p) => p.resolutionDegree < thresholdZoom);
    const maxUpdatedZoom = extractMaxUpdateZoomLevel(partsData);

    // Step 1: Handle all res from 0 to zoomThreshold in one seed task
    const baseZoomLevel = 0;
    const seedOptions = this.createSeedOptions(SeedMode.SEED, seedGeometry, cacheName, baseZoomLevel, Math.min(maxUpdatedZoom, this.zoomThreshold));
    const taskParams = this.createTaskParams(catalogId, seedOptions);
    seedTasks.push({ type: seedTaskType, parameters: taskParams });

    // Step 2: Handle high-res parts individually by zoom level
    for (const part of highZoomParts) {
      const partZoomLevel = degreesPerPixelToZoomLevel(part.resolutionDegree);
      for (let zoom = this.zoomThreshold + 1; zoom <= Math.min(partZoomLevel, this.maxZoom); zoom++) {
        // the min between the parts updated zoom level and the max allowed zoom
        const estimatedTiles = featureToTilesCount(feature(part.footprint), zoom);

        if (estimatedTiles <= this.maxTilesPerSeedTask) {
          // If tiles count is within limit, create a single task
          const options = this.createSeedOptions(SeedMode.SEED, part.footprint, cacheName, zoom, zoom);
          const taskParams = this.createTaskParams(catalogId, options);
          seedTasks.push({ type: seedTaskType, parameters: taskParams });
        } else {
          // If tiles count exceeds limit, split the geometry
          const splitGeometries = splitGeometryByTileCount(part.footprint, zoom, this.maxTilesPerSeedTask);
          for (const geometry of splitGeometries) {
            const options = this.createSeedOptions(SeedMode.SEED, geometry, cacheName, zoom, zoom);
            const taskParams = this.createTaskParams(catalogId, options);
            seedTasks.push({ type: seedTaskType, parameters: taskParams });
          }
        }
      }
    }

    return seedTasks;
  }

  private createSeedOptions(
    mode: SeedMode,
    geometry: Footprint,
    cacheName: string,
    fromZoomLevel: number = 0,
    toZoomLevel: number = this.maxZoom
  ): SeedTaskOptions {
    const { grid, skipUncached } = this.tilesSeedingConfig;
    const refreshBefore = getUTCDate().toISOString().replace(/\..+/, '');
    return {
      mode,
      grid,
      fromZoomLevel: fromZoomLevel,
      toZoomLevel: toZoomLevel,
      geometry,
      skipUncached,
      layerId: cacheName,
      refreshBefore,
    };
  }

  private createTaskParams(catalogId: string, seedOptions: SeedTaskOptions): SeedTaskParams {
    return {
      seedTasks: [seedOptions],
      catalogId,
      traceParentContext: undefined, // todo - add tracing
      cacheType: LayerCacheType.REDIS,
    };
  }

  private calculateGeometryByMode(
    mode: SeedMode,
    job: IngestionUpdateFinalizeJob | IngestionSwapUpdateFinalizeJob
  ): Polygon | MultiPolygon | undefined {
    const logger = this.logger.child({ mode });
    logger.debug({ msg: 'Getting geometry for seeding job' });
    if (mode === SeedMode.CLEAN && job.type === this.swapUpdateJobType) {
      const footprint = job.parameters.additionalParams.footprint;
      return footprint;
    }

    const unifiedFeature = unifyParts(job.parameters.partsData);
    const geometry = unifiedFeature?.geometry;

    return geometry;
  }
}
