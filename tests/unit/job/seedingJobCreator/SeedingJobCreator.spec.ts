/* eslint-disable @typescript-eslint/unbound-method */
import { randomUUID } from 'crypto';
import nock from 'nock';
import { OperationStatus } from '@map-colonies/mc-priority-queue';
import { LayerCacheType, SeedMode } from '../../../../src/common/constants';
import { SeedJobParams, SeedTaskOptions, SeedTaskParams, TilesSeedingTaskConfig } from '../../../../src/common/interfaces';
import { multiPartData } from '../../mocks/partsMockData';
import { registerDefaultConfig } from '../../mocks/configMock';
import { LayerCacheNotFoundError } from '../../../../src/common/errors';
import { ingestionUpdateFinalizeJob, ingestionUpdateJob } from '../../mocks/jobsMockData';
import { SeedingJobCreatorTestContext, seedJobParameters, setupSeedingJobCreatorTest } from './seedingJobCreatorSetup';

describe('SeedingJobCreator', () => {
  let seedingJobCreatorContext: SeedingJobCreatorTestContext;
  beforeEach(() => {
    jest.resetAllMocks();
    registerDefaultConfig();
    seedingJobCreatorContext = setupSeedingJobCreatorTest();
  });

  describe('createSeedingJob', () => {
    it('should create seeding job successfully with clean task mode', async () => {
      const { seedingJobCreator, queueClientMock, jobManagerClientMock, mapproxyClientMock, configMock } = seedingJobCreatorContext;
      const baseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
      const seedJobType = configMock.get<string>('jobManagement.ingestion.jobs.seed.type');
      const tilesSeedingConfig = configMock.get<TilesSeedingTaskConfig>('jobManagement.ingestion.tasks.tilesSeeding');
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

      const seedJobParams: SeedJobParams = {
        mode: SeedMode.CLEAN,
        layerName: 'layer-Orthophoto',
        ingestionJob: ingestionUpdateFinalizeJob,
      };

      const seedTaskOptions: SeedTaskOptions = {
        fromZoomLevel: 0,
        toZoomLevel: tilesSeedingConfig.maxZoom,
        skipUncached: tilesSeedingConfig.skipUncached,
        geometry: geometry,
        refreshBefore: '2024-11-05T13:50:27',
        layerId: layerCacheName,
        grid: tilesSeedingConfig.grid,
        mode: seedJobParams.mode,
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
              cacheType: LayerCacheType.REDIS,
              catalogId: ingestionUpdateJob.internalId,
              seedTasks: [seedTaskOptions],
              traceParentContext: undefined,
            } as SeedTaskParams,
          },
        ],
      };

      jest.spyOn(seedingJobCreator as unknown as { createSeedOptions: jest.Func }, 'createSeedOptions').mockReturnValue(seedTaskOptions);
      mapproxyClientMock.getCacheName.mockResolvedValue(layerCacheName);
      jobManagerClientMock.createJob.mockResolvedValue({ id: seedJobId, taskIds: [taskId] });

      nock(baseUrl)
        .post('/jobs')
        .reply(200, { id: seedJobId, taskIds: [taskId] });

      const res = await seedingJobCreator.create(seedJobParams);

      expect(mapproxyClientMock.getCacheName).toHaveBeenCalledWith({ layerName: seedJobParams.layerName, cacheType: LayerCacheType.REDIS });
      expect(queueClientMock.jobManagerClient.createJob).toHaveBeenCalledWith(seedJob);
      expect(res).toBeUndefined();
    });

    it('should create seeding job successfully with seed task mode', async () => {
      const { seedingJobCreator, queueClientMock, jobManagerClientMock, mapproxyClientMock, configMock } = seedingJobCreatorContext;
      const baseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
      const seedJobType = configMock.get<string>('jobManagement.ingestion.jobs.seed.type');
      const tilesSeedingConfig = configMock.get<TilesSeedingTaskConfig>('jobManagement.ingestion.tasks.tilesSeeding');
      const layerCacheName = 'cache-Name-s3';
      const taskId = randomUUID();
      const seedJobId = randomUUID();
      const currentFootprint = {
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

      const seedJobParams: SeedJobParams = {
        ...seedJobParameters,
        mode: SeedMode.SEED,
      };

      const seedTaskOptions: SeedTaskOptions = {
        fromZoomLevel: 0,
        toZoomLevel: tilesSeedingConfig.maxZoom,
        skipUncached: tilesSeedingConfig.skipUncached,
        geometry: currentFootprint,
        refreshBefore: '2024-11-05T13:50:27',
        layerId: layerCacheName,
        grid: tilesSeedingConfig.grid,
        mode: seedJobParams.mode,
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
              cacheType: LayerCacheType.REDIS,
              catalogId: ingestionUpdateJob.internalId,
              seedTasks: [seedTaskOptions],
              traceParentContext: undefined,
            } as SeedTaskParams,
          },
        ],
      };

      jest.spyOn(seedingJobCreator as unknown as { createSeedOptions: jest.Func }, 'createSeedOptions').mockReturnValue(seedTaskOptions);
      mapproxyClientMock.getCacheName.mockResolvedValue(layerCacheName);
      jobManagerClientMock.createJob.mockResolvedValue({ id: seedJobId, taskIds: [taskId] });

      nock(baseUrl)
        .post('/jobs')
        .reply(200, { id: seedJobId, taskIds: [taskId] });

      const res = await seedingJobCreator.create(seedJobParams);

      expect(mapproxyClientMock.getCacheName).toHaveBeenCalledWith({ layerName: seedJobParams.layerName, cacheType: LayerCacheType.REDIS });
      expect(queueClientMock.jobManagerClient.createJob).toHaveBeenCalledWith(seedJob);
      expect(res).toBeUndefined();
    });

    it('should create seeding job successfully with seed task mode(more then 1 part)', async () => {
      const { seedingJobCreator, queueClientMock, jobManagerClientMock, mapproxyClientMock, configMock } = seedingJobCreatorContext;
      const baseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
      const seedJobType = configMock.get<string>('jobManagement.ingestion.jobs.seed.type');
      const tilesSeedingConfig = configMock.get<TilesSeedingTaskConfig>('jobManagement.ingestion.tasks.tilesSeeding');
      const layerCacheName = 'cache-Name-s3';
      const taskId = randomUUID();
      const seedJobId = randomUUID();
      const currentFootprint = {
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

      ingestionUpdateJob.parameters.partsData = multiPartData;

      const seedJobParams: SeedJobParams = {
        ...seedJobParameters,
        mode: SeedMode.SEED,
      };

      const seedTaskOptions: SeedTaskOptions = {
        fromZoomLevel: 0,
        toZoomLevel: tilesSeedingConfig.maxZoom,
        skipUncached: tilesSeedingConfig.skipUncached,
        geometry: currentFootprint,
        refreshBefore: '2024-11-05T13:50:27',
        layerId: layerCacheName,
        grid: tilesSeedingConfig.grid,
        mode: seedJobParams.mode,
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
              cacheType: LayerCacheType.REDIS,
              catalogId: ingestionUpdateJob.internalId,
              seedTasks: [seedTaskOptions],
              traceParentContext: undefined,
            } as SeedTaskParams,
          },
        ],
      };

      jest.spyOn(seedingJobCreator as unknown as { createSeedOptions: jest.Func }, 'createSeedOptions').mockReturnValue(seedTaskOptions);
      mapproxyClientMock.getCacheName.mockResolvedValue(layerCacheName);
      jobManagerClientMock.createJob.mockResolvedValue({ id: seedJobId, taskIds: [taskId] });

      nock(baseUrl)
        .post('/jobs')
        .reply(200, { id: seedJobId, taskIds: [taskId] });

      const res = await seedingJobCreator.create(seedJobParams);

      expect(mapproxyClientMock.getCacheName).toHaveBeenCalledWith({ layerName: seedJobParams.layerName, cacheType: LayerCacheType.REDIS });
      expect(queueClientMock.jobManagerClient.createJob).toHaveBeenCalledWith(seedJob);
      expect(res).toBeUndefined();
    });

    it('should skip creating seeding job - no cache name found', async () => {
      const { seedingJobCreator, mapproxyClientMock, jobManagerClientMock } = seedingJobCreatorContext;
      const layerCacheName = 'not-exist-s3';
      mapproxyClientMock.getCacheName.mockRejectedValue(new LayerCacheNotFoundError(layerCacheName, LayerCacheType.REDIS));

      const seedJobParams: SeedJobParams = {
        ...seedJobParameters,
        mode: SeedMode.SEED,
      };

      await seedingJobCreator.create(seedJobParams);

      expect(jobManagerClientMock.createJob).not.toHaveBeenCalled();
    });

    it('should skip creating seeding job - no footprint found', async () => {
      const { seedingJobCreator, mapproxyClientMock, jobManagerClientMock } = seedingJobCreatorContext;
      const layerCacheName = 'layer-name';
      mapproxyClientMock.getCacheName.mockResolvedValue(layerCacheName);

      const seedJobParams: SeedJobParams = {
        ...seedJobParameters,
        mode: SeedMode.SEED,
      };

      jest.spyOn(seedingJobCreator as unknown as { calculateGeometryByMode: jest.Func }, 'calculateGeometryByMode').mockReturnValue(undefined);
      await seedingJobCreator.create(seedJobParams);

      expect(jobManagerClientMock.createJob).not.toHaveBeenCalled();
    });
  });
});
