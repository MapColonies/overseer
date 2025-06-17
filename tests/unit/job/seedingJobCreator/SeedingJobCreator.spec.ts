/* eslint-disable @typescript-eslint/unbound-method */
import { randomUUID } from 'crypto';
import nock from 'nock';
import { OperationStatus } from '@map-colonies/mc-priority-queue';
import { feature } from '@turf/turf';
import { LayerCacheType, SeedMode } from '../../../../src/common/constants';
import { SeedJobParams, SeedTaskOptions, SeedTaskParams, TilesSeedingTaskConfig } from '../../../../src/common/interfaces';
import { multiPartData } from '../../mocks/partsMockData';
import { registerDefaultConfig } from '../../mocks/configMock';
import { LayerCacheNotFoundError } from '../../../../src/common/errors';
import {
  ingestionSwapUpdateFinalizeJob,
  ingestionUpdateJob,
  ingestionUpdateJobHighRes,
  ingestionUpdateJobHighResMaxTiles,
} from '../../mocks/jobsMockData';
import { unifyParts, splitGeometryByTileCount } from '../../../../src/utils/seedingUtils';
import { SeedingJobCreatorTestContext, seedJobParameters, setupSeedingJobCreatorTest } from './seedingJobCreatorSetup';

describe('SeedingJobCreator', () => {
  let seedingJobCreatorContext: SeedingJobCreatorTestContext;
  beforeEach(() => {
    jest.resetAllMocks();
    registerDefaultConfig();
    seedingJobCreatorContext = setupSeedingJobCreatorTest();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
    jest.restoreAllMocks();
  });

  describe('createSeedingJob', () => {
    it('should create seeding job successfully with clean task mode on swapUpdate', async () => {
      const { seedingJobCreator, queueClientMock, jobManagerClientMock, mapproxyClientMock, configMock } = seedingJobCreatorContext;
      const baseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
      const seedJobType = configMock.get<string>('jobManagement.ingestion.jobs.seed.type');
      const tilesSeedingConfig = configMock.get<TilesSeedingTaskConfig>('jobManagement.ingestion.tasks.tilesSeeding');
      const layerCacheName = 'cache-Name-s3';
      const taskId = randomUUID();
      const seedJobId = randomUUID();

      const seedJobParams: SeedJobParams = {
        layerName: 'layer-Orthophoto',
        ingestionJob: ingestionSwapUpdateFinalizeJob,
      };

      const seedTaskOptions: SeedTaskOptions = {
        fromZoomLevel: 0,
        toZoomLevel: tilesSeedingConfig.maxZoom,
        skipUncached: tilesSeedingConfig.skipUncached,
        geometry: ingestionSwapUpdateFinalizeJob.parameters.additionalParams.footprint,
        refreshBefore: '2024-11-05T13:50:27',
        layerId: layerCacheName,
        grid: tilesSeedingConfig.grid,
        mode: SeedMode.CLEAN,
      };

      const seedJob = {
        resourceId: ingestionSwapUpdateFinalizeJob.resourceId,
        internalId: ingestionSwapUpdateFinalizeJob.internalId,
        version: ingestionSwapUpdateFinalizeJob.version,
        type: seedJobType,
        parameters: {},
        status: OperationStatus.IN_PROGRESS,
        producerName: ingestionSwapUpdateFinalizeJob.producerName,
        productType: ingestionSwapUpdateFinalizeJob.productType,
        domain: ingestionSwapUpdateFinalizeJob.domain,
        tasks: [
          {
            type: tilesSeedingConfig.type,
            parameters: {
              cacheType: LayerCacheType.REDIS,
              catalogId: ingestionSwapUpdateFinalizeJob.internalId,
              seedTasks: [seedTaskOptions],
              traceParentContext: undefined,
            } as SeedTaskParams,
          },
        ],
      };

      jest.useFakeTimers().setSystemTime(new Date('2024-11-05T13:50:27Z'));
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

    it('should create seeding job successfully with seed task and clean task on update with more than one part', async () => {
      const { seedingJobCreator, queueClientMock, jobManagerClientMock, mapproxyClientMock, configMock } = seedingJobCreatorContext;
      const baseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
      const seedJobType = configMock.get<string>('jobManagement.ingestion.jobs.seed.type');
      const tilesSeedingConfig = configMock.get<TilesSeedingTaskConfig>('jobManagement.ingestion.tasks.tilesSeeding');
      const layerCacheName = 'cache-Name-s3';
      const taskId = randomUUID();
      const seedJobId = randomUUID();
      const seedJobParams: SeedJobParams = {
        ...seedJobParameters,
      };

      const seedTaskOptions: SeedTaskOptions = {
        fromZoomLevel: 0,
        toZoomLevel: 4,
        skipUncached: tilesSeedingConfig.skipUncached,
        geometry: feature(ingestionUpdateJob.parameters.partsData[0].footprint).geometry,
        refreshBefore: '2024-11-05T13:50:27',
        layerId: layerCacheName,
        grid: tilesSeedingConfig.grid,
        mode: SeedMode.SEED,
      };

      const cleanTaskOptions: SeedTaskOptions = {
        fromZoomLevel: 5,
        toZoomLevel: tilesSeedingConfig.maxZoom,
        skipUncached: tilesSeedingConfig.skipUncached,
        geometry: feature(ingestionUpdateJob.parameters.partsData[0].footprint).geometry,
        refreshBefore: '2024-11-05T13:50:27',
        layerId: layerCacheName,
        grid: tilesSeedingConfig.grid,
        mode: SeedMode.CLEAN,
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
              seedTasks: [cleanTaskOptions],
              traceParentContext: undefined,
            } as SeedTaskParams,
          },
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

      jest.useFakeTimers().setSystemTime(new Date('2024-11-05T13:50:27Z'));
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

    it('should create seeding job successfully with seed task mode (more than 1 part)', async () => {
      const { seedingJobCreator, queueClientMock, jobManagerClientMock, mapproxyClientMock, configMock } = seedingJobCreatorContext;
      const baseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
      const seedJobType = configMock.get<string>('jobManagement.ingestion.jobs.seed.type');
      const tilesSeedingConfig = configMock.get<TilesSeedingTaskConfig>('jobManagement.ingestion.tasks.tilesSeeding');
      const layerCacheName = 'cache-Name-s3';
      const taskId = randomUUID();
      const seedJobId = randomUUID();

      ingestionUpdateJob.parameters.partsData = multiPartData;

      const seedJobParams: SeedJobParams = {
        ...seedJobParameters,
      };

      const seedTaskOptions: SeedTaskOptions = {
        fromZoomLevel: 0,
        toZoomLevel: 4,
        skipUncached: tilesSeedingConfig.skipUncached,
        geometry: feature(ingestionUpdateJob.parameters.partsData[0].footprint).geometry,
        refreshBefore: '2024-11-05T13:50:27',
        layerId: layerCacheName,
        grid: tilesSeedingConfig.grid,
        mode: SeedMode.SEED,
      };

      const cleanTaskOptions: SeedTaskOptions = {
        fromZoomLevel: 5,
        toZoomLevel: tilesSeedingConfig.maxZoom,
        skipUncached: tilesSeedingConfig.skipUncached,
        geometry: feature(ingestionUpdateJob.parameters.partsData[0].footprint).geometry,
        refreshBefore: '2024-11-05T13:50:27',
        layerId: layerCacheName,
        grid: tilesSeedingConfig.grid,
        mode: SeedMode.CLEAN,
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
              seedTasks: [cleanTaskOptions],
              traceParentContext: undefined,
            } as SeedTaskParams,
          },
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
      jest.useFakeTimers().setSystemTime(new Date('2024-11-05T13:50:27Z'));
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
      };

      jest.spyOn(seedingJobCreator as unknown as { calculateGeometryByMode: jest.Func }, 'calculateGeometryByMode').mockReturnValue(undefined);
      await seedingJobCreator.create(seedJobParams);

      expect(jobManagerClientMock.createJob).not.toHaveBeenCalled();
    });

    describe('multiple seed tasks', () => {
      it('should create multiple seed tasks when high-res parts doesnt exceed maxTilesPerSeedTask', async () => {
        const { seedingJobCreator, queueClientMock, jobManagerClientMock, mapproxyClientMock, configMock } = seedingJobCreatorContext;
        const baseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
        const seedJobType = configMock.get<string>('jobManagement.ingestion.jobs.seed.type');
        const tilesSeedingConfig = configMock.get<TilesSeedingTaskConfig>('jobManagement.ingestion.tasks.tilesSeeding');
        const layerCacheName = 'cache-Name-s3';
        const taskId = randomUUID();
        const seedJobId = randomUUID();

        const seedJobParams: SeedJobParams = {
          ...seedJobParameters,
          ingestionJob: ingestionUpdateJobHighRes,
        };

        // Get unified geometry from all parts
        const unifiedGeometry = unifyParts(ingestionUpdateJobHighRes.parameters.partsData);
        const seedGeometry = unifiedGeometry?.geometry;

        if (!seedGeometry) {
          throw new Error('Failed to unify parts geometry');
        }

        // Base task from 0 to zoomThreshold
        const baseSeedTaskOptions: SeedTaskOptions = {
          fromZoomLevel: 0,
          toZoomLevel: 16,
          skipUncached: tilesSeedingConfig.skipUncached,
          geometry: seedGeometry,
          refreshBefore: '2024-11-05T13:50:27',
          layerId: layerCacheName,
          grid: tilesSeedingConfig.grid,
          mode: SeedMode.SEED,
        };

        // High-res task that will be split
        const highResSeedTaskOptions: SeedTaskOptions = {
          fromZoomLevel: 17,
          toZoomLevel: 17,
          skipUncached: tilesSeedingConfig.skipUncached,
          geometry: feature(ingestionUpdateJobHighRes.parameters.partsData[0].footprint).geometry,
          refreshBefore: '2024-11-05T13:50:27',
          layerId: layerCacheName,
          grid: tilesSeedingConfig.grid,
          mode: SeedMode.SEED,
        };

        const cleanTaskOptions: SeedTaskOptions = {
          fromZoomLevel: 18,
          toZoomLevel: tilesSeedingConfig.maxZoom,
          skipUncached: tilesSeedingConfig.skipUncached,
          geometry: seedGeometry,
          refreshBefore: '2024-11-05T13:50:27',
          layerId: layerCacheName,
          grid: tilesSeedingConfig.grid,
          mode: SeedMode.CLEAN,
        };

        const seedJob = {
          resourceId: ingestionUpdateJobHighRes.resourceId,
          internalId: ingestionUpdateJobHighRes.internalId,
          version: ingestionUpdateJobHighRes.version,
          type: seedJobType,
          parameters: {},
          status: OperationStatus.IN_PROGRESS,
          producerName: ingestionUpdateJobHighRes.producerName,
          productType: ingestionUpdateJobHighRes.productType,
          domain: ingestionUpdateJobHighRes.domain,
          tasks: [
            {
              type: tilesSeedingConfig.type,
              parameters: {
                cacheType: LayerCacheType.REDIS,
                catalogId: ingestionUpdateJobHighRes.internalId,
                seedTasks: [cleanTaskOptions],
                traceParentContext: undefined,
              } as SeedTaskParams,
            },
            {
              type: tilesSeedingConfig.type,
              parameters: {
                cacheType: LayerCacheType.REDIS,
                catalogId: ingestionUpdateJobHighRes.internalId,
                seedTasks: [baseSeedTaskOptions],
                traceParentContext: undefined,
              } as SeedTaskParams,
            },
            {
              type: tilesSeedingConfig.type,
              parameters: {
                cacheType: LayerCacheType.REDIS,
                catalogId: ingestionUpdateJobHighRes.internalId,
                seedTasks: [highResSeedTaskOptions],
                traceParentContext: undefined,
              } as SeedTaskParams,
            },
          ],
        };

        jest.useFakeTimers().setSystemTime(new Date('2024-11-05T13:50:27Z'));
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

      it('should create multiple seed tasks when high-res parts exceed maxTilesPerSeedTask', async () => {
        const { seedingJobCreator, queueClientMock, jobManagerClientMock, mapproxyClientMock, configMock } = seedingJobCreatorContext;
        const baseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
        const seedJobType = configMock.get<string>('jobManagement.ingestion.jobs.seed.type');
        const tilesSeedingConfig = configMock.get<TilesSeedingTaskConfig>('jobManagement.ingestion.tasks.tilesSeeding');
        const layerCacheName = 'cache-Name-s3';
        const taskId = randomUUID();
        const seedJobId = randomUUID();

        const seedJobParams: SeedJobParams = {
          ...seedJobParameters,
          ingestionJob: ingestionUpdateJobHighResMaxTiles,
        };

        // Get unified geometry from all parts
        const unifiedGeometry = unifyParts(ingestionUpdateJobHighResMaxTiles.parameters.partsData);
        const seedGeometry = unifiedGeometry?.geometry;

        if (!seedGeometry) {
          throw new Error('Failed to unify parts geometry');
        }

        // Get the first part's geometry for high-res splitting
        const firstPartGeometry = ingestionUpdateJobHighResMaxTiles.parameters.partsData[0].footprint;

        // Split the first part geometry by tile count (zoom level 17, maxTiles from config)
        const maxTilesPerSeedTask = configMock.get<number>('jobManagement.ingestion.tasks.tilesSeeding.maxTilesPerSeedTask');
        const splitGeometries = splitGeometryByTileCount(firstPartGeometry, 17, maxTilesPerSeedTask);

        // Base task from 0 to zoomThreshold
        const baseSeedTaskOptions: SeedTaskOptions = {
          fromZoomLevel: 0,
          toZoomLevel: 16,
          skipUncached: tilesSeedingConfig.skipUncached,
          geometry: seedGeometry,
          refreshBefore: '2024-11-05T13:50:27',
          layerId: layerCacheName,
          grid: tilesSeedingConfig.grid,
          mode: SeedMode.SEED,
        };

        // High-res tasks using the split geometries
        const highResSeedTaskOptions1: SeedTaskOptions = {
          fromZoomLevel: 17,
          toZoomLevel: 17,
          skipUncached: tilesSeedingConfig.skipUncached,
          geometry: splitGeometries[0],
          refreshBefore: '2024-11-05T13:50:27',
          layerId: layerCacheName,
          grid: tilesSeedingConfig.grid,
          mode: SeedMode.SEED,
        };

        const highResSeedTaskOptions2: SeedTaskOptions = {
          fromZoomLevel: 17,
          toZoomLevel: 17,
          skipUncached: tilesSeedingConfig.skipUncached,
          geometry: splitGeometries[1],
          refreshBefore: '2024-11-05T13:50:27',
          layerId: layerCacheName,
          grid: tilesSeedingConfig.grid,
          mode: SeedMode.SEED,
        };

        const highResSeedTaskOptions3: SeedTaskOptions = {
          fromZoomLevel: 17,
          toZoomLevel: 17,
          skipUncached: tilesSeedingConfig.skipUncached,
          geometry: splitGeometries[2],
          refreshBefore: '2024-11-05T13:50:27',
          layerId: layerCacheName,
          grid: tilesSeedingConfig.grid,
          mode: SeedMode.SEED,
        };

        const highResSeedTaskOptions4: SeedTaskOptions = {
          fromZoomLevel: 17,
          toZoomLevel: 17,
          skipUncached: tilesSeedingConfig.skipUncached,
          geometry: splitGeometries[3],
          refreshBefore: '2024-11-05T13:50:27',
          layerId: layerCacheName,
          grid: tilesSeedingConfig.grid,
          mode: SeedMode.SEED,
        };

        const cleanTaskOptions: SeedTaskOptions = {
          fromZoomLevel: 18,
          toZoomLevel: tilesSeedingConfig.maxZoom,
          skipUncached: tilesSeedingConfig.skipUncached,
          geometry: seedGeometry,
          refreshBefore: '2024-11-05T13:50:27',
          layerId: layerCacheName,
          grid: tilesSeedingConfig.grid,
          mode: SeedMode.CLEAN,
        };

        const seedJob = {
          resourceId: ingestionUpdateJobHighResMaxTiles.resourceId,
          internalId: ingestionUpdateJobHighResMaxTiles.internalId,
          version: ingestionUpdateJobHighRes.version,
          type: seedJobType,
          parameters: {},
          status: OperationStatus.IN_PROGRESS,
          producerName: ingestionUpdateJobHighResMaxTiles.producerName,
          productType: ingestionUpdateJobHighResMaxTiles.productType,
          domain: ingestionUpdateJobHighResMaxTiles.domain,
          tasks: [
            {
              type: tilesSeedingConfig.type,
              parameters: {
                cacheType: LayerCacheType.REDIS,
                catalogId: ingestionUpdateJobHighResMaxTiles.internalId,
                seedTasks: [cleanTaskOptions],
                traceParentContext: undefined,
              } as SeedTaskParams,
            },
            {
              type: tilesSeedingConfig.type,
              parameters: {
                cacheType: LayerCacheType.REDIS,
                catalogId: ingestionUpdateJobHighResMaxTiles.internalId,
                seedTasks: [baseSeedTaskOptions],
                traceParentContext: undefined,
              } as SeedTaskParams,
            },
            {
              type: tilesSeedingConfig.type,
              parameters: {
                cacheType: LayerCacheType.REDIS,
                catalogId: ingestionUpdateJobHighResMaxTiles.internalId,
                seedTasks: [highResSeedTaskOptions1],
                traceParentContext: undefined,
              } as SeedTaskParams,
            },
            {
              type: tilesSeedingConfig.type,
              parameters: {
                cacheType: LayerCacheType.REDIS,
                catalogId: ingestionUpdateJobHighResMaxTiles.internalId,
                seedTasks: [highResSeedTaskOptions2],
                traceParentContext: undefined,
              } as SeedTaskParams,
            },
            {
              type: tilesSeedingConfig.type,
              parameters: {
                cacheType: LayerCacheType.REDIS,
                catalogId: ingestionUpdateJobHighResMaxTiles.internalId,
                seedTasks: [highResSeedTaskOptions3],
                traceParentContext: undefined,
              } as SeedTaskParams,
            },
            {
              type: tilesSeedingConfig.type,
              parameters: {
                cacheType: LayerCacheType.REDIS,
                catalogId: ingestionUpdateJobHighResMaxTiles.internalId,
                seedTasks: [highResSeedTaskOptions4],
                traceParentContext: undefined,
              } as SeedTaskParams,
            },
          ],
        };

        jest.useFakeTimers().setSystemTime(new Date('2024-11-05T13:50:27Z'));
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
    });
  });
});
