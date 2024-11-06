import { inject, injectable } from 'tsyringe';
import { ICreateJobBody, ICreateJobResponse, OperationStatus, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { Footprint, getUTCDate } from '@map-colonies/mc-utils';
import { Logger } from '@map-colonies/js-logger';
import { IConfig, ISeedJobParams, ISeedTaskOptions, ISeedTaskParams, ITilesSeedingTaskConfig } from '../../common/interfaces';
import { PublishedLayerCacheType, SeedMode, SERVICES } from '../../common/constants';
import { internalIdSchema } from '../../utils/zod/schemas/jobParametersSchema';
import { MapproxyApiClient } from '../../httpClients/mapproxyClient';

@injectable()
export class SeedingJobCreator {
  private readonly tilesSeedingConfig: ITilesSeedingTaskConfig;
  private readonly seedJobType: string;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.QUEUE_CLIENT) protected queueClient: QueueClient,
    @inject(MapproxyApiClient) private readonly mapproxyClient: MapproxyApiClient
  ) {
    this.tilesSeedingConfig = this.config.get<ITilesSeedingTaskConfig>('jobManagement.ingestion.tasks.tilesSeeding');
    this.seedJobType = this.config.get<string>('jobManagement.ingestion.jobs.seed.type');
  }

  public async create({ mode, geometry, layerName, ingestionJob }: ISeedJobParams): Promise<ICreateJobResponse> {
    const { type: seedTaskType } = this.tilesSeedingConfig;
    const logger = this.logger.child({ ingestionJobId: ingestionJob.id, jobType: this.seedJobType, taskType: seedTaskType });

    logger.debug({ msg: 'creating seeding job for Ingestion Job', ingestionJob });
    const { resourceId, version, producerName, productType, domain } = ingestionJob;

    logger.debug({ msg: 'getting cache name for layer', layerName });
    const cacheName = await this.mapproxyClient.getCacheName({ layerName, cacheType: PublishedLayerCacheType.REDIS });
    logger.debug({ msg: 'got cache name', cacheName });

    logger.debug({ msg: 'creating seed options' });
    const seedOptions = this.createSeedOptions(mode, geometry, cacheName);
    logger.debug({ msg: 'created seed options', seedOptions });

    const validCatalogId = internalIdSchema.parse(ingestionJob).internalId;

    logger.debug({ msg: 'creating task params' });
    const taskParams = this.createTaskParams(validCatalogId, seedOptions);

    logger.debug({ msg: 'created task params', taskParams });

    logger.info({ msg: 'creating seeding job' });
    const createJobRequest: ICreateJobBody<unknown, ISeedTaskParams> = {
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

    return res;
  }

  private createSeedOptions(mode: SeedMode, geometry: Footprint, cacheName: string): ISeedTaskOptions {
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

  private createTaskParams(catalogId: string, seedOptions: ISeedTaskOptions): ISeedTaskParams {
    return {
      seedTasks: [seedOptions],
      catalogId,
      traceParentContext: undefined, // todo - add tracing
      cacheType: PublishedLayerCacheType.REDIS,
    };
  }
}
