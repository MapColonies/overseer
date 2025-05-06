import { Logger } from '@map-colonies/js-logger';
import { PolygonPart } from '@map-colonies/raster-shared';
import { ICreateJobBody, OperationStatus, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { getUTCDate } from '@map-colonies/mc-utils';
import { feature, featureCollection, union } from '@turf/turf';
import { Feature, MultiPolygon, Polygon } from 'geojson';
import { inject, injectable } from 'tsyringe';
import { context, SpanStatusCode, trace, Tracer } from '@opentelemetry/api';
import { LayerCacheType, SeedMode, SERVICES } from '../../../common/constants';
import { Footprint, IConfig, SeedJobParams, SeedTaskOptions, SeedTaskParams, TilesSeedingTaskConfig } from '../../../common/interfaces';
import { MapproxyApiClient } from '../../../httpClients/mapproxyClient';
import { internalIdSchema } from '../../../utils/zod/schemas/jobParameters.schema';
import { IngestionSwapUpdateFinalizeJob, IngestionUpdateFinalizeJob } from '../../../utils/zod/schemas/job.schema';
import { extractMaxUpdateZoomLevel } from '../../../utils/partsDataUtil';

@injectable()
export class SeedingJobCreator {
  private readonly tilesSeedingConfig: TilesSeedingTaskConfig;
  private readonly seedJobType: string;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.TRACER) private readonly tracer: Tracer,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.QUEUE_CLIENT) protected queueClient: QueueClient,
    @inject(MapproxyApiClient) private readonly mapproxyClient: MapproxyApiClient
  ) {
    this.tilesSeedingConfig = this.config.get<TilesSeedingTaskConfig>('jobManagement.ingestion.tasks.tilesSeeding');
    this.seedJobType = this.config.get<string>('jobManagement.ingestion.jobs.seed.type');
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

        const seedTasks: {
          type: string;
          parameters: SeedTaskParams;
        }[] = [];

        // Handle different modes
        const clearModeTask = this.handleCleanMode(ingestionJob, cacheName, validCatalogId);
        const seedModeTasks = this.handleSeedMode(ingestionJob, cacheName, validCatalogId);

        if (clearModeTask) {
          seedTasks.push(clearModeTask);
        }
        seedTasks.push(...seedModeTasks);

        if (seedTasks.length === 0) {
          logger.warn({ msg: 'No tasks created, skipping job creation' });
          activeSpan?.addEvent('createJob.skipped', { reason: 'No tasks created' });
          return;
        }

        const { resourceId, version, producerName, productType, domain } = ingestionJob;
        const createJobRequest: ICreateJobBody<unknown, SeedTaskParams> = {
          resourceId,
          internalId: validCatalogId,
          version,
          type: this.seedJobType,
          parameters: {},
          status: OperationStatus.IN_PROGRESS,
          producerName: producerName ?? undefined,
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
  ): { type: string; parameters: SeedTaskParams } | void {
    const activeSpan = trace.getActiveSpan();
    const seedTaskType = this.tilesSeedingConfig.type;
    const logger = this.logger.child({ mode: SeedMode.CLEAN });

    const cleanGeometry = this.calculateGeometryByMode(SeedMode.CLEAN, job);
    if (!cleanGeometry) {
      activeSpan?.addEvent('calculateCleanGeometry.empty');
      logger.warn({ msg: 'No geometry found for CLEAN mode' });
      return;
    }

    activeSpan?.addEvent('calculateCleanGeometry.success', { geometry: JSON.stringify(cleanGeometry) });

    if (job.type === this.config.get<string>('jobManagement.polling.jobs.swapUpdate.type')) {
      const cleanOptions = this.createSeedOptions(SeedMode.CLEAN, cleanGeometry, cacheName);
      activeSpan?.addEvent('createSeedOptions.success', { seedOptions: JSON.stringify(cleanOptions) });

      const taskParams = this.createTaskParams(catalogId, cleanOptions);
      activeSpan?.addEvent('createTaskParams.success', { taskParams: JSON.stringify(taskParams) });

      return { type: seedTaskType, parameters: taskParams };
    } else if (job.type === this.config.get<string>('jobManagement.polling.jobs.update.type')) {
      const maxUpdateZoomLevel = extractMaxUpdateZoomLevel(job);
      if (maxUpdateZoomLevel + 1 <= this.tilesSeedingConfig.maxZoom) {
        const cleanOptions = this.createSeedOptions(SeedMode.CLEAN, cleanGeometry, cacheName, maxUpdateZoomLevel + 1);
        activeSpan?.addEvent('createSeedOptions.success', { seedOptions: JSON.stringify(cleanOptions) });

        const taskParams = this.createTaskParams(catalogId, cleanOptions);
        activeSpan?.addEvent('createTaskParams.success', { taskParams: JSON.stringify(taskParams) });

        return { type: seedTaskType, parameters: taskParams };
      }
    }
    logger.debug({ msg: 'Ingestion Job is not of update type, skipping CLEAN creation' });
    return;
  }

  private handleSeedMode(
    job: IngestionUpdateFinalizeJob | IngestionSwapUpdateFinalizeJob,
    cacheName: string,
    catalogId: string
  ): { type: string; parameters: SeedTaskParams }[] {
    const activeSpan = trace.getActiveSpan();
    const seedTaskType = this.tilesSeedingConfig.type;

    if (job.type !== this.config.get<string>('jobManagement.polling.jobs.update.type')) {
      this.logger.debug({ msg: 'Ingestion Job is not of update type, skipping SEED creation' });
      return [];
    }

    const seedGeometry = this.calculateGeometryByMode(SeedMode.SEED, job);
    if (!seedGeometry) {
      activeSpan?.addEvent('calculateSeedGeometry.empty');
      this.logger.warn({ msg: 'No geometry found for SEED mode' });
      return [];
    }

    const maxUpdateZoomLevel = extractMaxUpdateZoomLevel(job);
    const seedOptions = this.createSeedOptions(SeedMode.SEED, seedGeometry, cacheName, 0, maxUpdateZoomLevel);
    activeSpan?.addEvent('createSeedOptions.success', { seedOptions: JSON.stringify(seedOptions) });

    const taskParams = this.createTaskParams(catalogId, seedOptions);
    activeSpan?.addEvent('createTaskParams.success', { taskParams: JSON.stringify(taskParams) });

    return [{ type: seedTaskType, parameters: taskParams }];
  }

  private createSeedOptions(mode: SeedMode, geometry: Footprint, cacheName: string, fromZoomLevel?: number, toZoomLevel?: number): SeedTaskOptions {
    const { grid, maxZoom, skipUncached } = this.tilesSeedingConfig;
    const refreshBefore = getUTCDate().toISOString().replace(/\..+/, '');
    return {
      mode,
      grid,
      fromZoomLevel: fromZoomLevel ?? 0,
      toZoomLevel: toZoomLevel ?? maxZoom,
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

  private calculateGeometryByMode(mode: SeedMode, job: IngestionUpdateFinalizeJob | IngestionSwapUpdateFinalizeJob): Footprint | undefined {
    const logger = this.logger.child({ mode });
    logger.debug({ msg: 'Getting geometry for seeding job' });
    if (mode === SeedMode.CLEAN) {
      const footprint = job.parameters.additionalParams.footprint;
      return footprint;
    }

    const feature = this.unifyParts(job.parameters.partsData);
    const geometry = feature?.geometry;

    return geometry;
  }

  private unifyParts(parts: PolygonPart[]): Feature<Polygon | MultiPolygon> | null {
    if (parts.length === 1) {
      return feature(parts[0].footprint);
    }
    const polygons = parts.map((part) => feature(part.footprint));
    const collection = featureCollection(polygons);
    const footprint = union(collection);
    return footprint;
  }
}
