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

  public async create({ mode, layerName, ingestionJob }: SeedJobParams): Promise<void> {
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
          mode,
          layerName,
        });

        logger.debug({ msg: 'Getting cache name for layer', layerName });
        const cacheName = await this.mapproxyClient.getCacheName({ layerName, cacheType: LayerCacheType.REDIS });
        activeSpan?.addEvent('getCacheName.success', { cacheName });

        const geometry = this.calculateGeometryByMode(mode, ingestionJob);

        if (!geometry) {
          activeSpan?.addEvent('calculateGeometry.empty');
          logger.warn({ msg: 'No geometry found, skipping seeding job creation' });
          return;
        }
        activeSpan?.addEvent('calculateGeometry.success', { geometry: JSON.stringify(geometry) });

        const seedOptions = this.createSeedOptions(mode, geometry, cacheName);
        activeSpan?.addEvent('createSeedOptions.success', { seedOptions: JSON.stringify(seedOptions) });

        const validCatalogId = internalIdSchema.parse(ingestionJob).internalId;
        const taskParams = this.createTaskParams(validCatalogId, seedOptions);
        activeSpan?.addEvent('createTaskParams.success', { taskParams: JSON.stringify(taskParams) });

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
          tasks: [
            {
              type: seedTaskType,
              parameters: taskParams,
            },
          ],
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

  private createSeedOptions(mode: SeedMode, geometry: Footprint, cacheName: string): SeedTaskOptions {
    const { grid, maxZoom, skipUncached } = this.tilesSeedingConfig;
    const refreshBefore = getUTCDate().toISOString().replace(/\..+/, '');
    return {
      mode,
      grid,
      fromZoomLevel: 0, // by design will always seed\clean from zoom 0
      toZoomLevel: maxZoom, // todo - on future should be calculated from mapproxy capabilities
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
