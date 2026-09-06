/* eslint-disable @typescript-eslint/unbound-method */
import { randomUUID } from 'node:crypto';
import type { MultiPolygon, Polygon } from 'geojson';
import { OperationStatus } from '@map-colonies/mc-priority-queue';
import { StorageProvider } from '@map-colonies/raster-shared';
import type { CacheDeletionJobParams, CacheDeletionTaskConfig, GetMapproxyCacheResponse } from '../../../../src/common/interfaces';
import { registerDefaultConfig, configMock, setValue } from '../../mocks/configMock';
import { createFakePolygonalGeometry } from '../../mocks/geometryMockData';
import { LayerCacheType } from '../../../../src/common/constants';
import { LayerCacheNotFoundError, UnsupportedGridError } from '../../../../src/common/errors';
import { ingestionSwapUpdateFinalizeJob, ingestionUpdateFinalizeJob } from '../../mocks/jobsMockData';
import type { CacheDeletionJobCreatorTestContext } from './cacheDeletionJobCreatorSetup';
import { setupCacheDeletionJobCreatorTest } from './cacheDeletionJobCreatorSetup';

/** the only grid GEODETIC_GRIDS admits, and the one the deployed mapproxy serves these caches on */
const GRID = 'WorldCRS84';

const redisCache = (cacheName: string, grids: string[] = [GRID]): GetMapproxyCacheResponse => ({
  cacheName: `${cacheName}-redis`,
  cache: { type: LayerCacheType.REDIS },
  grids,
});

describe('CacheDeletionJobCreator', () => {
  let ctx: CacheDeletionJobCreatorTestContext;
  let productGeometry: Polygon | MultiPolygon;

  beforeEach(async () => {
    vi.resetAllMocks();
    registerDefaultConfig();
    ctx = await setupCacheDeletionJobCreatorTest();
    productGeometry = createFakePolygonalGeometry({ radiusInMeters: 50 });
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  describe('swap-update', () => {
    it('should create a Swap_Delete_Cache job with a single prefix-wipe task carrying the delay', async () => {
      const { cacheDeletionJobCreator, jobManagerClientMock, mapproxyClientMock } = ctx;
      const taskConfig = configMock.get<CacheDeletionTaskConfig>('jobManagement.ingestion.tasks.cacheDeletion');
      const jobType = configMock.get<string>('jobManagement.ingestion.jobs.swapCacheDeletion.type');
      const jobId = randomUUID();

      mapproxyClientMock.getRedisCache.mockResolvedValue(redisCache('layer-Orthophoto'));
      jobManagerClientMock.createJob.mockResolvedValue({ id: jobId, taskIds: [randomUUID()] });

      const params: CacheDeletionJobParams = { layerName: 'layer-Orthophoto', ingestionJob: ingestionSwapUpdateFinalizeJob };

      await cacheDeletionJobCreator.create(params);

      // must ask for the REDIS cache explicitly - the layer's tiles cache is file or s3
      expect(mapproxyClientMock.getRedisCache).toHaveBeenCalledWith({ layerName: 'layer-Orthophoto', cacheType: LayerCacheType.REDIS });
      expect(jobManagerClientMock.createJob).toHaveBeenCalledTimes(1);
      expect(jobManagerClientMock.createTaskForJob).not.toHaveBeenCalled();

      const request = jobManagerClientMock.createJob.mock.calls[0]![0];

      expect(request).toMatchObject({
        resourceId: ingestionSwapUpdateFinalizeJob.resourceId,
        internalId: ingestionSwapUpdateFinalizeJob.internalId,
        version: ingestionSwapUpdateFinalizeJob.version,
        type: jobType,
        status: OperationStatus.IN_PROGRESS,
      });
      expect(request.parameters).toStrictEqual({
        ingestionJobId: ingestionSwapUpdateFinalizeJob.id,
        ingestionJobType: ingestionSwapUpdateFinalizeJob.type,
      });
      // cleaner resolves DeleteStoredResourcesStrategy from this job type; the update job type
      // would route the same params to the range strategy and fail validation
      expect(request.type).toBe('Swap_Delete_Cache');
      expect(request.tasks).toStrictEqual([
        {
          type: taskConfig.type,
          description: 'redis cache prefix wipe',
          parameters: {
            storageProvider: StorageProvider.REDIS,
            // no explicit prefix from mapproxy, so loader.py's fallback applies
            prefix: `layer-Orthophoto-redis_${GRID}`,
            delaySeconds: taskConfig.gracefulReloadMaxSeconds + taskConfig.reloadWindowMarginSeconds,
          },
        },
      ]);
    });

    it('should compose the prefix from the cache name and grid mapproxy reports, not from config', async () => {
      const { cacheDeletionJobCreator, jobManagerClientMock, mapproxyClientMock } = ctx;

      mapproxyClientMock.getRedisCache.mockResolvedValue(redisCache('sss-Orthophoto', ['WorldCRS84']));
      jobManagerClientMock.createJob.mockResolvedValue({ id: randomUUID(), taskIds: [randomUUID()] });

      await cacheDeletionJobCreator.create({ layerName: 'sss-Orthophoto', ingestionJob: ingestionSwapUpdateFinalizeJob });

      const request = jobManagerClientMock.createJob.mock.calls[0]![0];

      // mapproxy reports no prefix of its own, so the creator composes loader.py's shape
      expect(request.tasks![0]!.parameters).toMatchObject({ prefix: 'sss-Orthophoto-redis_WorldCRS84' });
    });

    it('should not read the product shapefile, since a wipe needs no geometry', async () => {
      const { cacheDeletionJobCreator, jobManagerClientMock, mapproxyClientMock, readProductGeometryMock } = ctx;

      mapproxyClientMock.getRedisCache.mockResolvedValue(redisCache('layer-Orthophoto'));
      jobManagerClientMock.createJob.mockResolvedValue({ id: randomUUID(), taskIds: [randomUUID()] });

      await cacheDeletionJobCreator.create({ layerName: 'layer-Orthophoto', ingestionJob: ingestionSwapUpdateFinalizeJob });

      expect(readProductGeometryMock).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should create an Update_Delete_Cache job with range tasks and no delay', async () => {
      const { cacheDeletionJobCreator, jobManagerClientMock, mapproxyClientMock, readProductGeometryMock } = ctx;
      const taskConfig = configMock.get<CacheDeletionTaskConfig>('jobManagement.ingestion.tasks.cacheDeletion');

      mapproxyClientMock.getRedisCache.mockResolvedValue(redisCache('layer-Orthophoto'));
      readProductGeometryMock.mockResolvedValue(productGeometry);
      jobManagerClientMock.createJob.mockResolvedValue({ id: randomUUID(), taskIds: [randomUUID()] });

      await cacheDeletionJobCreator.create({ layerName: 'layer-Orthophoto', ingestionJob: ingestionUpdateFinalizeJob });

      expect(readProductGeometryMock).toHaveBeenCalledWith(ingestionUpdateFinalizeJob.parameters.inputFiles.productShapefilePath);
      expect(jobManagerClientMock.createJob).toHaveBeenCalledTimes(1);
      // cleaner resolves TilesDeletionStrategy from this job type
      expect(jobManagerClientMock.createJob.mock.calls[0]![0].type).toBe('Update_Delete_Cache');

      const tasks = jobManagerClientMock.createJob.mock.calls[0]![0].tasks!;

      expect(tasks.length).toBeGreaterThan(0);

      for (const task of tasks) {
        expect(task.type).toBe(taskConfig.type);

        const { ranges } = task.parameters as { ranges: unknown[] };

        expect(Array.isArray(ranges)).toBe(true);
        expect(ranges.length).toBeLessThanOrEqual(taskConfig.maxRangesPerTask);
        // toStrictEqual (rather than toMatchObject) pins the exact field set: no delaySeconds, and
        // no other field the worker's .strict() params schema would reject at runtime.
        expect(task.parameters).toStrictEqual({
          storageProvider: StorageProvider.REDIS,
          prefix: `layer-Orthophoto-redis_${GRID}`,
          ranges,
        });
      }
    });

    it('should cover every zoom from 0 to maxZoom', async () => {
      const { cacheDeletionJobCreator, jobManagerClientMock, mapproxyClientMock, readProductGeometryMock } = ctx;
      const taskConfig = configMock.get<CacheDeletionTaskConfig>('jobManagement.ingestion.tasks.cacheDeletion');

      mapproxyClientMock.getRedisCache.mockResolvedValue(redisCache('layer-Orthophoto'));
      readProductGeometryMock.mockResolvedValue(productGeometry);
      jobManagerClientMock.createJob.mockResolvedValue({ id: randomUUID(), taskIds: [randomUUID()] });
      jobManagerClientMock.createTaskForJob.mockResolvedValue(undefined);

      await cacheDeletionJobCreator.create({ layerName: 'layer-Orthophoto', ingestionJob: ingestionUpdateFinalizeJob });

      // createTaskForJob's param type is `ICreateTaskBody<T> | ICreateTaskBody<T>[]`; the creator
      // always passes an array, so flatten through a cast.
      const streamedTasks = jobManagerClientMock.createTaskForJob.mock.calls.flatMap((call) => call[1] as { parameters: unknown }[]);
      const allTasks = [...jobManagerClientMock.createJob.mock.calls[0]![0].tasks!, ...streamedTasks];
      const zooms = new Set(allTasks.flatMap((task) => (task.parameters as { ranges: { zoom: number }[] }).ranges.map((range) => range.zoom)));

      expect(Math.min(...zooms)).toBe(0);
      expect(Math.max(...zooms)).toBe(taskConfig.maxZoom);
    });

    it('should stream the remaining tasks with createTaskForJob once the first batch fills the job', async () => {
      const jobId = randomUUID();

      // A 1-tile budget makes every range its own task, and a shallow maxZoom keeps the count
      // small. The creator reads config in its constructor, so the context must be rebuilt after
      // changing these - the `ctx` from beforeEach still holds the defaults.
      setValue('jobManagement.ingestion.tasks.cacheDeletion.tileBatchSize', 1);
      setValue('jobManagement.ingestion.tasks.cacheDeletion.taskBatchSize', 2);
      setValue('jobManagement.ingestion.tasks.cacheDeletion.maxZoom', 3);

      const { cacheDeletionJobCreator, jobManagerClientMock, mapproxyClientMock, readProductGeometryMock } = await setupCacheDeletionJobCreatorTest();

      mapproxyClientMock.getRedisCache.mockResolvedValue(redisCache('layer-Orthophoto'));
      readProductGeometryMock.mockResolvedValue(productGeometry);
      jobManagerClientMock.createJob.mockResolvedValue({ id: jobId, taskIds: [randomUUID()] });

      await cacheDeletionJobCreator.create({ layerName: 'layer-Orthophoto', ingestionJob: ingestionUpdateFinalizeJob });

      expect(jobManagerClientMock.createJob).toHaveBeenCalledTimes(1);
      expect(jobManagerClientMock.createJob.mock.calls[0]![0].tasks).toHaveLength(2);
      expect(jobManagerClientMock.createTaskForJob).toHaveBeenCalled();

      for (const call of jobManagerClientMock.createTaskForJob.mock.calls) {
        expect(call[0]).toBe(jobId);
        // createTaskForJob's param is `ICreateTaskBody<T> | ICreateTaskBody<T>[]`; we always pass an
        // array. The final flush may be a partial batch, hence the inequality.
        expect((call[1] as unknown[]).length).toBeLessThanOrEqual(2);
      }
    });

    it('should fail the job explicitly when a mid-stream enqueue fails, rather than leaving a silent partial success', async () => {
      const jobId = randomUUID();

      // Same config trick as the streaming test above: a 1-tile budget and a shallow maxZoom
      // guarantee more than one flush, so the job-creating flush (createJob) succeeds before the
      // failure hits a later flush (createTaskForJob) - the scenario where a job already exists
      // but is missing tasks.
      setValue('jobManagement.ingestion.tasks.cacheDeletion.tileBatchSize', 1);
      setValue('jobManagement.ingestion.tasks.cacheDeletion.taskBatchSize', 2);
      setValue('jobManagement.ingestion.tasks.cacheDeletion.maxZoom', 3);

      const { cacheDeletionJobCreator, jobManagerClientMock, mapproxyClientMock, readProductGeometryMock } = await setupCacheDeletionJobCreatorTest();

      mapproxyClientMock.getRedisCache.mockResolvedValue(redisCache('layer-Orthophoto'));
      readProductGeometryMock.mockResolvedValue(productGeometry);
      jobManagerClientMock.createJob.mockResolvedValue({ id: jobId, taskIds: [randomUUID()] });
      jobManagerClientMock.createTaskForJob.mockRejectedValue(new Error('job-manager unreachable'));

      // create() must still resolve - the caller (updateJobHandler) runs this after its own task
      // already completed, so throwing here would fail an ingestion finalize whose work is done.
      await expect(
        cacheDeletionJobCreator.create({ layerName: 'layer-Orthophoto', ingestionJob: ingestionUpdateFinalizeJob })
      ).resolves.toBeUndefined();

      expect(jobManagerClientMock.createJob).toHaveBeenCalledTimes(1);
      expect(jobManagerClientMock.createTaskForJob).toHaveBeenCalled();
      // the job already exists with only its first batch enqueued - left alone it would run to
      // completion and be reported as a fully successful cache deletion, so it must be failed
      // explicitly, against the id of the job that was actually created.
      expect(jobManagerClientMock.updateJob).toHaveBeenCalledWith(jobId, expect.objectContaining({ status: OperationStatus.FAILED }));
    });
  });

  describe('production key fixture', () => {
    // Anchors the two assumptions that fail silently AND successfully if wrong - a bad prefix
    // deletes nothing and the task still acks, bad grid math deletes the wrong tiles. Both are
    // pinned here against a key observed in a deployed environment:
    //   bluemarble_swap_test-RasterVectorBest-redis_WorldCRS84-6-76-43
    const CACHE_NAME = 'bluemarble_swap_test-RasterVectorBest';
    const LAYER_NAME = 'bluemarble_swap_test-RasterVectorBest';
    const KNOWN_KEY = 'bluemarble_swap_test-RasterVectorBest-redis_WorldCRS84-6-76-43';
    const TILE = { zoom: 6, x: 76, y: 43 };

    it('should emit params that reconstruct the known production key', async () => {
      const { cacheDeletionJobCreator, jobManagerClientMock, mapproxyClientMock, readProductGeometryMock } = ctx;

      // a tiny footprint at the centre of tile z6/76/43 - lon [33.75, 36.5625], lat [30.9375, 33.75]
      const span = 180 / 2 ** TILE.zoom;
      const lon = -180 + TILE.x * span + span / 2;
      const lat = -90 + TILE.y * span + span / 2;
      const delta = 0.001;
      const footprint: Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [lon - delta, lat - delta],
            [lon + delta, lat - delta],
            [lon + delta, lat + delta],
            [lon - delta, lat + delta],
            [lon - delta, lat - delta],
          ],
        ],
      };

      // no explicit prefix, mirroring the deployed configuration this key came from
      mapproxyClientMock.getRedisCache.mockResolvedValue(redisCache(CACHE_NAME));
      readProductGeometryMock.mockResolvedValue(footprint);
      jobManagerClientMock.createJob.mockResolvedValue({ id: randomUUID(), taskIds: [randomUUID()] });

      await cacheDeletionJobCreator.create({ layerName: LAYER_NAME, ingestionJob: ingestionUpdateFinalizeJob });

      const params = jobManagerClientMock.createJob.mock.calls[0]![0].tasks!.map(
        (task) => task.parameters as { prefix: string; ranges: { zoom: number; minX: number; maxX: number; minY: number; maxY: number }[] }
      );

      const { prefix } = params[0]!;

      expect(prefix).toBe('bluemarble_swap_test-RasterVectorBest-redis_WorldCRS84');

      const rangeForTile = params
        .flatMap((param) => param.ranges)
        .find((range) => range.zoom === TILE.zoom && TILE.x >= range.minX && TILE.x <= range.maxX && TILE.y >= range.minY && TILE.y <= range.maxY);

      expect(rangeForTile).toBeDefined();

      // the key cleaner will build from these params must match what mapproxy actually wrote
      expect(`${prefix}-${TILE.zoom}-${TILE.x}-${TILE.y}`).toBe(KNOWN_KEY);
    });
  });

  describe('failure handling', () => {
    it('should swallow and log a mapproxy failure without creating a job', async () => {
      const { cacheDeletionJobCreator, jobManagerClientMock, mapproxyClientMock } = ctx;

      mapproxyClientMock.getRedisCache.mockRejectedValue(new LayerCacheNotFoundError('layer-Orthophoto', 'redis'));

      await expect(
        cacheDeletionJobCreator.create({ layerName: 'layer-Orthophoto', ingestionJob: ingestionUpdateFinalizeJob })
      ).resolves.toBeUndefined();
      expect(jobManagerClientMock.createJob).not.toHaveBeenCalled();
    });

    it('should create no job when mapproxy reports a grid footprintToTileRanges does not support', async () => {
      const { cacheDeletionJobCreator, jobManagerClientMock, mapproxyClientMock, readProductGeometryMock } = ctx;

      mapproxyClientMock.getRedisCache.mockResolvedValue(redisCache('layer-Orthophoto', ['webmercator']));
      const resolveGridSpy = vi.spyOn(cacheDeletionJobCreator as unknown as { resolveGrid: () => void }, 'resolveGrid');
      readProductGeometryMock.mockResolvedValue(productGeometry);

      await expect(
        cacheDeletionJobCreator.create({ layerName: 'layer-Orthophoto', ingestionJob: ingestionUpdateFinalizeJob })
      ).resolves.toBeUndefined();
      expect(resolveGridSpy).toThrowError(UnsupportedGridError);
      expect(jobManagerClientMock.createJob).not.toHaveBeenCalled();
    });

    it.each<{ name: string; cache: GetMapproxyCacheResponse }>([
      { name: 'several grids', cache: redisCache('layer-Orthophoto', [GRID, 'epsg3857']) },
      { name: 'no grids', cache: redisCache('layer-Orthophoto', []) },
      // mapproxy-api returns the cache verbatim, so a cache without grids has no grids field
      { name: 'no grids field at all', cache: { cacheName: 'layer-Orthophoto', cache: { type: LayerCacheType.REDIS } } },
    ])('should create no job when mapproxy reports $name', async ({ cache }) => {
      const { cacheDeletionJobCreator, jobManagerClientMock, mapproxyClientMock } = ctx;

      mapproxyClientMock.getRedisCache.mockResolvedValue(cache);

      await expect(
        cacheDeletionJobCreator.create({ layerName: 'layer-Orthophoto', ingestionJob: ingestionSwapUpdateFinalizeJob })
      ).resolves.toBeUndefined();
      expect(jobManagerClientMock.createJob).not.toHaveBeenCalled();
    });
  });
});
