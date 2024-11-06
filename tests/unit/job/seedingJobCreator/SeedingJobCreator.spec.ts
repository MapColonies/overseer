/* eslint-disable @typescript-eslint/unbound-method */
import { randomUUID } from 'crypto';
import nock from 'nock';
import { OperationStatus } from '@map-colonies/mc-priority-queue';
import { PublishedLayerCacheType, SeedMode } from '../../../../src/common/constants';
import { ISeedJobParams, ISeedTaskOptions, ISeedTaskParams, ITilesSeedingTaskConfig } from '../../../../src/common/interfaces';
import { registerDefaultConfig } from '../../mocks/configMock';
import { LayerCacheNotFoundError } from '../../../../src/common/errors';
import { ingestionUpdateJob } from '../../mocks/jobsMockData';
import { SeedingJobCreatorTestContext, setupSeedingJobCreatorTest } from './seedingJobCreatorSetup';

describe('SeedingJobCreator', () => {
  let seedingJobCreatorContext: SeedingJobCreatorTestContext;
  beforeEach(() => {
    jest.resetAllMocks();
    registerDefaultConfig();
    seedingJobCreatorContext = setupSeedingJobCreatorTest();
  });

  describe('createSeedingJob', () => {
    it('should create seeding job successfully', async () => {
      const { seedingJobCreator, queueClientMock, jobManagerClientMock, mapproxyClientMock, configMock } = seedingJobCreatorContext;
      const baseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
      const seedJobType = configMock.get<string>('jobManagement.ingestion.jobs.seed.type');
      const tilesSeedingConfig = configMock.get<ITilesSeedingTaskConfig>('jobManagement.ingestion.tasks.tilesSeeding');
      const layerCacheName = 'cache-Name-s3';
      const taskId = randomUUID();
      const seedJobId = randomUUID();
      const geometry = {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [0, 1],
            [1, 1],
            [1, 0],
            [0, 0],
          ],
        ],
      } as GeoJSON.Polygon;

      const seedJobParams: ISeedJobParams = {
        mode: SeedMode.SEED,
        geometry,
        layerName: 'layer-Name',
        ingestionJob: ingestionUpdateJob,
      };

      const seeTaskOptions: ISeedTaskOptions = {
        fromZoomLevel: 0,
        toZoomLevel: tilesSeedingConfig.maxZoom,
        skipUncached: tilesSeedingConfig.skipUncached,
        geometry: geometry,
        refreshBefore: '2024-11-05T13:50:27',
        layerId: layerCacheName,
        grid: tilesSeedingConfig.grid,
        mode: SeedMode.SEED,
      };

      const seedJob = {
        resourceId: ingestionUpdateJob.resourceId,
        internalId: ingestionUpdateJob.internalId,
        version: ingestionUpdateJob.version,
        type: seedJobType,
        parameters: {},
        status: OperationStatus.IN_PROGRESS,
        producerName: ingestionUpdateJob.producerName,
        productType: ingestionUpdateJob.productType,
        domain: ingestionUpdateJob.domain,
        tasks: [
          {
            type: tilesSeedingConfig.type,
            parameters: {
              cacheType: PublishedLayerCacheType.REDIS,
              catalogId: ingestionUpdateJob.internalId,
              seedTasks: [seeTaskOptions],
              traceParentContext: undefined,
            } as ISeedTaskParams,
          },
        ],
      };

      jest.spyOn(seedingJobCreator as unknown as { createSeedOptions: jest.Func }, 'createSeedOptions').mockReturnValue(seeTaskOptions);
      mapproxyClientMock.getCacheName.mockResolvedValue(layerCacheName);
      jobManagerClientMock.createJob.mockResolvedValue({ id: seedJobId, taskIds: [taskId] });

      nock(baseUrl)
        .post('/jobs')
        .reply(200, { id: seedJobId, taskIds: [taskId] });

      const res = await seedingJobCreator.create(seedJobParams);

      expect(mapproxyClientMock.getCacheName).toHaveBeenCalledWith({ layerName: seedJobParams.layerName, cacheType: PublishedLayerCacheType.REDIS });
      expect(queueClientMock.jobManagerClient.createJob).toHaveBeenCalledWith(seedJob);
      expect(res).toEqual({ id: seedJobId, taskIds: [taskId] });
    });

    it('should throw an error when creating seeding job fails', async () => {
      const { seedingJobCreator, mapproxyClientMock } = seedingJobCreatorContext;
      const layerCacheName = 'not-exist-s3';
      mapproxyClientMock.getCacheName.mockRejectedValue(new LayerCacheNotFoundError(layerCacheName, PublishedLayerCacheType.REDIS));

      const geometry = {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [0, 1],
            [1, 1],
            [1, 0],
            [0, 0],
          ],
        ],
      } as GeoJSON.Polygon;

      const seedJobParams: ISeedJobParams = {
        mode: SeedMode.SEED,
        geometry,
        layerName: 'layer-Name',
        ingestionJob: ingestionUpdateJob,
      };

      const action = seedingJobCreator.create(seedJobParams);

      await expect(action).rejects.toThrow(LayerCacheNotFoundError);
    });
  });
});
