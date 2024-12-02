import { Logger } from '@map-colonies/js-logger';
import { IngestionUpdateJobParams, polygonPartsEntityNameSchema } from '@map-colonies/mc-model-types';
import { ICreateJobBody, IJobResponse, OperationStatus, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { Footprint, getUTCDate } from '@map-colonies/mc-utils';
import { feature, featureCollection, intersect } from '@turf/turf';
import { Polygon } from 'geojson';
import { inject, injectable } from 'tsyringe';
import { LayerCacheType, SeedMode, SERVICES } from '../../common/constants';
import { IConfig, SeedJobParams, SeedTaskOptions, SeedTaskParams, TilesSeedingTaskConfig } from '../../common/interfaces';
import { MapproxyApiClient } from '../../httpClients/mapproxyClient';
import { PolygonPartsMangerClient } from '../../httpClients/polygonPartsMangerClient';
import { internalIdSchema } from '../../utils/zod/schemas/jobParametersSchema';

@injectable()
export class SeedingJobCreator {
  private readonly tilesSeedingConfig: TilesSeedingTaskConfig;
  private readonly seedJobType: string;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.QUEUE_CLIENT) protected queueClient: QueueClient,
    @inject(MapproxyApiClient) private readonly mapproxyClient: MapproxyApiClient,
    private readonly polygonPartsMangerClient: PolygonPartsMangerClient
  ) {
    this.tilesSeedingConfig = this.config.get<TilesSeedingTaskConfig>('jobManagement.ingestion.tasks.tilesSeeding');
    this.seedJobType = this.config.get<string>('jobManagement.ingestion.jobs.seed.type');
  }

  public async create({ mode, currentFootprint, layerName, ingestionJob }: SeedJobParams): Promise<void> {
    try {
      const { type: seedTaskType } = this.tilesSeedingConfig;

      const logger = this.logger.child({ ingestionJobId: ingestionJob.id, jobType: this.seedJobType, taskType: seedTaskType });
      logger.info({ msg: 'Starting seeding job creation process' });

      logger.debug({ msg: 'Creating seeding job for Ingestion Job', ingestionJob });

      logger.debug({ msg: 'Getting cache name for layer', layerName });
      const cacheName = await this.mapproxyClient.getCacheName({ layerName, cacheType: LayerCacheType.REDIS });
      logger.debug({ msg: 'Got cache name', cacheName });

      const geometry = await this.calculateGeometryByMode(mode, currentFootprint, ingestionJob);

      if (!geometry) {
        logger.warn({ msg: 'No intersection found, skipping seeding job creation' });
        return;
      }

      const seedOptions = this.createSeedOptions(mode, geometry, cacheName);
      logger.debug({ msg: 'Created seed options', seedOptions });

      logger.debug({ msg: 'Creating task params' });
      const validCatalogId = internalIdSchema.parse(ingestionJob).internalId;
      const taskParams = this.createTaskParams(validCatalogId, seedOptions);

      logger.debug({ msg: 'Created task params', taskParams });

      const { resourceId, version, producerName, productType, domain } = ingestionJob;
      logger.info({ msg: 'Creating seeding job' });
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

      logger.info({ msg: 'Sending seeding job to queue', createJobRequest });
      const res = await this.queueClient.jobManagerClient.createJob(createJobRequest);
      logger.info({ msg: 'Seeding job created successfully', seedJobId: res.id, seedTaskIds: res.taskIds });
    } catch (err) {
      if (err instanceof Error) {
        return this.logger.error({ msg: `Failed to create seeding job: ${err.message}`, error: err });
      }
    }
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

  private async calculateGeometryByMode(
    mode: SeedMode,
    currentFootprint: Polygon,
    job: IJobResponse<IngestionUpdateJobParams, unknown>
  ): Promise<Footprint | undefined> {
    const logger = this.logger.child({ mode });
    logger.debug({ msg: 'Getting geometry for seeding job' });
    if (mode === SeedMode.CLEAN) {
      return currentFootprint;
    }

    logger.debug({ msg: 'Validating additional params', additionalParams: job.parameters.additionalParams });
    const { polygonPartsEntityName } = polygonPartsEntityNameSchema.parse(job.parameters.additionalParams);

    logger.debug({ msg: 'Getting new footprint from layer aggregated data' });
    const { footprint: aggregatedFootprint } = await this.polygonPartsMangerClient.getAggregatedLayerMetadata(polygonPartsEntityName);

    const footprintsFeatureCollection = featureCollection([feature(aggregatedFootprint), feature(currentFootprint)]);
    const geometry = intersect<Polygon>(footprintsFeatureCollection)?.geometry;
    logger.debug({ msg: 'Calculated intersection geometry', geometry });

    return geometry;
  }
}
