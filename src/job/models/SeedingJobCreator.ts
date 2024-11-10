import { inject, injectable } from 'tsyringe';
import { ICreateJobBody, IJobResponse, OperationStatus, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { IngestionUpdateJobParams } from '@map-colonies/mc-model-types';
import { Footprint, getUTCDate } from '@map-colonies/mc-utils';
import { feature, featureCollection, intersect } from '@turf/turf';
import { Polygon } from 'geojson';
import { Logger } from '@map-colonies/js-logger';
import { IConfig, SeedJobParams, SeedTaskOptions, SeedTaskParams, TilesSeedingTaskConfig } from '../../common/interfaces';
import { LayerCacheType, SeedMode, SERVICES } from '../../common/constants';
import { internalIdSchema } from '../../utils/zod/schemas/jobParametersSchema';
import { MapproxyApiClient } from '../../httpClients/mapproxyClient';
import { PolygonPartMangerClient } from '../../httpClients/polygonPartMangerClient';
import { SkipSeedingJobError } from '../../common/errors';

@injectable()
export class SeedingJobCreator {
  private readonly tilesSeedingConfig: TilesSeedingTaskConfig;
  private readonly seedJobType: string;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.QUEUE_CLIENT) protected queueClient: QueueClient,
    @inject(MapproxyApiClient) private readonly mapproxyClient: MapproxyApiClient,
    private readonly polygonPartMangerClient: PolygonPartMangerClient
  ) {
    this.tilesSeedingConfig = this.config.get<TilesSeedingTaskConfig>('jobManagement.ingestion.tasks.tilesSeeding');
    this.seedJobType = this.config.get<string>('jobManagement.ingestion.jobs.seed.type');
  }

  public async create({ mode, currentFootprint, layerName, ingestionJob }: SeedJobParams): Promise<void> {
    try {
      const { type: seedTaskType } = this.tilesSeedingConfig;

      const logger = this.logger.child({ ingestionJobId: ingestionJob.id, jobType: this.seedJobType, taskType: seedTaskType });
      logger.info({ msg: 'Starting seeding job creation process' });

      logger.debug({ msg: 'creating seeding job for Ingestion Job', ingestionJob });
      const { resourceId, version, producerName, productType, domain } = ingestionJob;

      logger.debug({ msg: 'getting cache name for layer', layerName });
      const cacheName = await this.mapproxyClient.getCacheName({ layerName, cacheType: LayerCacheType.REDIS });
      logger.debug({ msg: 'got cache name', cacheName });

      const geometry = this.calculateGeometryByMode(mode, currentFootprint, ingestionJob);
      const seedOptions = this.createSeedOptions(mode, geometry, cacheName);
      logger.debug({ msg: 'created seed options', seedOptions });

      const validCatalogId = internalIdSchema.parse(ingestionJob).internalId;

      logger.debug({ msg: 'creating task params' });
      const taskParams = this.createTaskParams(validCatalogId, seedOptions);

      logger.debug({ msg: 'created task params', taskParams });

      logger.info({ msg: 'creating seeding job' });
      const createJobRequest: ICreateJobBody<unknown, SeedTaskParams> = {
        resourceId,
        internalId: validCatalogId,
        version,
        type: this.seedJobType,
        parameters: {},
        status: OperationStatus.IN_PROGRESS,
        producerName,
        productType,
        domain,
        tasks: [
          {
            type: seedTaskType,
            parameters: taskParams,
          },
        ],
      };

      logger.info({ msg: 'sending seeding job to queue', createJobRequest });
      const res = await this.queueClient.jobManagerClient.createJob(createJobRequest);
      logger.info({ msg: 'Seeding job created successfully', seedJobId: res.id, seedTaskIds: res.taskIds });
    } catch (err) {
      if (err instanceof SkipSeedingJobError) {
        return this.logger.warn({ msg: `Skipping seeding job creation: ${err.message}`, error: err });
      }
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
      fromZoomLevel: 0, // by design will alway seed\clean from zoom 0
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

  private calculateGeometryByMode(
    mode: SeedMode,
    currentFootprint: Polygon,
    ingestionJob: IJobResponse<IngestionUpdateJobParams, unknown>
  ): Footprint {
    const logger = this.logger.child({ mode });
    logger.debug({ msg: 'getting geometry for seeding job' });
    if (mode === SeedMode.CLEAN) {
      return currentFootprint;
    }

    logger.debug({ msg: 'Getting new footprint from layer aggregated data' });
    const { footprint: newFootprint } = this.polygonPartMangerClient.getAggregatedPartData(ingestionJob.parameters.partsData);

    const footprintsFeatureCollection = featureCollection([feature(newFootprint), feature(currentFootprint)]);
    const geometry = intersect<Polygon>(footprintsFeatureCollection)?.geometry;
    logger.debug({ msg: 'Calculated intersection geometry', geometry });

    if (!geometry) {
      throw new SkipSeedingJobError('There is no intersection between current and new footprints');
    }

    return geometry;
  }
}