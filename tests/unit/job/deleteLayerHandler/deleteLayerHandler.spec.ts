/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/naming-convention */
import { getEntityName } from '@map-colonies/raster-shared';
import type { GetMapproxyCacheResponse } from '../../../../src/common/interfaces';
import { LayerCacheType } from '../../../../src/common/constants';
import { registerDefaultConfig, setValue } from '../../mocks/configMock';
import { deleteLayerJob } from '../../mocks/jobsMockData';
import { deleteTaskForDeleteLayer } from '../../mocks/tasksMockData';
import { setupDeleteLayerHandlerTest } from './deleteLayerHandlerSetup';

describe('DeleteLayerHandler', () => {
  const layerName = `${deleteLayerJob.resourceId}-${deleteLayerJob.productType}`;
  const entityName = getEntityName(deleteLayerJob.resourceId, deleteLayerJob.productType);
  const tilesDeletionType = 'tiles-deletion';

  const fsCacheResponse: GetMapproxyCacheResponse = {
    cacheName: layerName,
    cache: {
      type: LayerCacheType.FS,
      directory: '/outputs/3460db6b-ef85-4871-9aae-ca42fac1edca/8fec1314-dc3e-43d7-9d8a-b056b1eb9771/',
      directory_layout: 'tms',
    },
  };
  const fsRelativePath = '3460db6b-ef85-4871-9aae-ca42fac1edca/8fec1314-dc3e-43d7-9d8a-b056b1eb9771/';

  const s3CacheResponse: GetMapproxyCacheResponse = {
    cacheName: layerName,
    cache: {
      type: LayerCacheType.S3,
      directory: '/5eedfc75-861c-42fc-81a9-ab2c0b95c274/d8527f15-5377-4a28-b5ce-92891d897aec/',
      directory_layout: 'tms',
    },
  };
  const s3KeyPrefix = '5eedfc75-861c-42fc-81a9-ab2c0b95c274/d8527f15-5377-4a28-b5ce-92891d897aec/';

  beforeEach(() => {
    vi.resetAllMocks();
    registerDefaultConfig();
  });

  describe('handleJobDelete', () => {
    it('should run all metadata deletion steps in order, mark each, then create cleaner tasks and complete', async () => {
      const {
        deleteLayerHandler,
        queueClientMock,
        jobManagerClientMock,
        catalogClientMock,
        geoserverClientMock,
        polygonPartsManagerClientMock,
        mapproxyClientMock,
      } = await setupDeleteLayerHandlerTest();
      const job = structuredClone(deleteLayerJob);
      const task = structuredClone(deleteTaskForDeleteLayer);

      mapproxyClientMock.getLayerCache.mockResolvedValue(fsCacheResponse);
      jobManagerClientMock.updateTask.mockResolvedValue(undefined);
      jobManagerClientMock.createTaskForJob.mockResolvedValue(undefined);
      queueClientMock.ack.mockResolvedValue(undefined);

      const completeTaskSpy = vi.spyOn(deleteLayerHandler as unknown as { completeTask: (...args: unknown[]) => unknown }, 'completeTask');

      await deleteLayerHandler.handleJobDelete(job, task);

      expect(catalogClientMock.deleteRecord).toHaveBeenCalledWith(job.internalId);
      expect(geoserverClientMock.unpublishLayer).toHaveBeenCalledWith(layerName);
      expect(polygonPartsManagerClientMock.deleteEntities).toHaveBeenCalledWith(entityName);
      expect(mapproxyClientMock.removeLayer).toHaveBeenCalledWith(layerName);

      // tiles location persisted first, then each step persisted immediately (§4.2, §6)
      expect(jobManagerClientMock.updateTask).toHaveBeenCalledTimes(5);
      expect(jobManagerClientMock.updateTask).toHaveBeenNthCalledWith(1, job.id, task.id, {
        parameters: {
          deleteFromCatalog: false,
          deleteFromGeoserver: false,
          deletePolygonParts: false,
          deleteFromMapproxy: false,
          tilesLocation: { path: fsRelativePath },
        },
      });
      expect(jobManagerClientMock.createTaskForJob).toHaveBeenCalledWith(job.id, expect.objectContaining({ type: tilesDeletionType }));
      expect(completeTaskSpy).toHaveBeenCalledWith(job, task, expect.any(Object));
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
    });

    it('should skip steps already marked completed on a redelivered task', async () => {
      const { deleteLayerHandler, jobManagerClientMock, catalogClientMock, geoserverClientMock, polygonPartsManagerClientMock, mapproxyClientMock } =
        await setupDeleteLayerHandlerTest();
      const job = structuredClone(deleteLayerJob);
      const task = structuredClone(deleteTaskForDeleteLayer);
      task.parameters = {
        deleteFromCatalog: true,
        deleteFromGeoserver: true,
        deletePolygonParts: false,
        deleteFromMapproxy: false,
        tilesLocation: { path: fsRelativePath },
      };

      jobManagerClientMock.updateTask.mockResolvedValue(undefined);
      jobManagerClientMock.createTaskForJob.mockResolvedValue(undefined);

      await deleteLayerHandler.handleJobDelete(job, task);

      expect(catalogClientMock.deleteRecord).not.toHaveBeenCalled();
      expect(geoserverClientMock.unpublishLayer).not.toHaveBeenCalled();
      expect(polygonPartsManagerClientMock.deleteEntities).toHaveBeenCalledWith(entityName);
      expect(mapproxyClientMock.removeLayer).toHaveBeenCalledWith(layerName);
      expect(jobManagerClientMock.updateTask).toHaveBeenCalledTimes(2);
    });

    it('should not create cleaner tasks until all steps are completed', async () => {
      const { deleteLayerHandler, jobManagerClientMock, mapproxyClientMock } = await setupDeleteLayerHandlerTest();
      const job = structuredClone(deleteLayerJob);
      const task = structuredClone(deleteTaskForDeleteLayer);
      // mapproxy step throws before completion, so not all steps complete
      mapproxyClientMock.getLayerCache.mockResolvedValue(fsCacheResponse);
      mapproxyClientMock.removeLayer.mockRejectedValue(new Error('mapproxy down'));

      await deleteLayerHandler.handleJobDelete(job, task);

      expect(jobManagerClientMock.createTaskForJob).not.toHaveBeenCalled();
    });

    it('should reject the task when a deletion step fails', async () => {
      const { deleteLayerHandler, queueClientMock, catalogClientMock, mapproxyClientMock } = await setupDeleteLayerHandlerTest();
      const job = structuredClone(deleteLayerJob);
      const task = structuredClone(deleteTaskForDeleteLayer);
      const error = new Error('catalog unreachable');

      mapproxyClientMock.getLayerCache.mockResolvedValue(fsCacheResponse);
      catalogClientMock.deleteRecord.mockRejectedValue(error);
      queueClientMock.reject.mockResolvedValue(undefined);

      await deleteLayerHandler.handleJobDelete(job, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, error.message);
    });
  });

  describe('tiles location resolution', () => {
    it('should resolve the tiles location from the mapproxy cache before the layer is removed', async () => {
      setValue('tilesStorageProvider', 'S3');
      const { deleteLayerHandler, jobManagerClientMock, mapproxyClientMock } = await setupDeleteLayerHandlerTest();
      const job = structuredClone(deleteLayerJob);
      const task = structuredClone(deleteTaskForDeleteLayer);

      mapproxyClientMock.getLayerCache.mockResolvedValue(s3CacheResponse);
      jobManagerClientMock.updateTask.mockResolvedValue(undefined);
      jobManagerClientMock.createTaskForJob.mockResolvedValue(undefined);

      await deleteLayerHandler.handleJobDelete(job, task);

      // key design point: the cache must be read BEFORE removeLayer
      expect(mapproxyClientMock.getLayerCache).toHaveBeenCalledTimes(1);
      expect(mapproxyClientMock.removeLayer).toHaveBeenCalledTimes(1);

      const cacheOrder = mapproxyClientMock.getLayerCache.mock.invocationCallOrder[0] ?? 0;
      const removeOrder = mapproxyClientMock.removeLayer.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER;

      expect(cacheOrder).toBeLessThan(removeOrder);
    });

    it('should pass the FS cache directory relative to the mount path (first folder stripped) without a bucket', async () => {
      setValue('tilesStorageProvider', 'FS');
      const { deleteLayerHandler, jobManagerClientMock, mapproxyClientMock } = await setupDeleteLayerHandlerTest();
      const job = structuredClone(deleteLayerJob);
      const task = structuredClone(deleteTaskForDeleteLayer);

      mapproxyClientMock.getLayerCache.mockResolvedValue(fsCacheResponse);
      jobManagerClientMock.updateTask.mockResolvedValue(undefined);
      jobManagerClientMock.createTaskForJob.mockResolvedValue(undefined);

      await deleteLayerHandler.handleJobDelete(job, task);

      expect(jobManagerClientMock.createTaskForJob).toHaveBeenCalledWith(
        job.id,
        expect.objectContaining({ parameters: { paths: [fsRelativePath], storageProvider: 'FS' } })
      );
    });

    it('should pass the S3 cache directory as a key prefix (leading slash stripped) with the cache bucket', async () => {
      setValue('tilesStorageProvider', 'S3');
      const { deleteLayerHandler, jobManagerClientMock, mapproxyClientMock } = await setupDeleteLayerHandlerTest();
      const job = structuredClone(deleteLayerJob);
      const task = structuredClone(deleteTaskForDeleteLayer);

      mapproxyClientMock.getLayerCache.mockResolvedValue({
        ...s3CacheResponse,
        cache: { ...s3CacheResponse.cache, bucket_name: 'mapproxy-cache-bucket' },
      });
      jobManagerClientMock.updateTask.mockResolvedValue(undefined);
      jobManagerClientMock.createTaskForJob.mockResolvedValue(undefined);

      await deleteLayerHandler.handleJobDelete(job, task);

      expect(jobManagerClientMock.createTaskForJob).toHaveBeenCalledWith(
        job.id,
        expect.objectContaining({ parameters: { paths: [s3KeyPrefix], storageProvider: 'S3', bucket: 'mapproxy-cache-bucket' } })
      );
    });

    it('should fall back to the configured tiles bucket when the cache has no bucket_name (S3)', async () => {
      setValue('tilesStorageProvider', 'S3');
      setValue('S3.tilesBucket', 'config-fallback-bucket');
      const { deleteLayerHandler, jobManagerClientMock, mapproxyClientMock } = await setupDeleteLayerHandlerTest();
      const job = structuredClone(deleteLayerJob);
      const task = structuredClone(deleteTaskForDeleteLayer);

      mapproxyClientMock.getLayerCache.mockResolvedValue(s3CacheResponse);
      jobManagerClientMock.updateTask.mockResolvedValue(undefined);
      jobManagerClientMock.createTaskForJob.mockResolvedValue(undefined);

      await deleteLayerHandler.handleJobDelete(job, task);

      expect(jobManagerClientMock.createTaskForJob).toHaveBeenCalledWith(
        job.id,
        expect.objectContaining({ parameters: { paths: [s3KeyPrefix], storageProvider: 'S3', bucket: 'config-fallback-bucket' } })
      );
    });

    it('should use the persisted tiles location on a redelivered task without querying mapproxy', async () => {
      setValue('tilesStorageProvider', 'S3');
      const { deleteLayerHandler, jobManagerClientMock, mapproxyClientMock } = await setupDeleteLayerHandlerTest();
      const job = structuredClone(deleteLayerJob);
      const task = structuredClone(deleteTaskForDeleteLayer);
      // all metadata steps already done; the mapproxy layer (and its cache) is gone
      task.parameters = {
        deleteFromCatalog: true,
        deleteFromGeoserver: true,
        deletePolygonParts: true,
        deleteFromMapproxy: true,
        tilesLocation: { path: s3KeyPrefix, bucket: 'persisted-bucket' },
      };

      jobManagerClientMock.createTaskForJob.mockResolvedValue(undefined);

      await deleteLayerHandler.handleJobDelete(job, task);

      expect(mapproxyClientMock.getLayerCache).not.toHaveBeenCalled();
      expect(jobManagerClientMock.updateTask).not.toHaveBeenCalled();
      expect(jobManagerClientMock.createTaskForJob).toHaveBeenCalledWith(
        job.id,
        expect.objectContaining({ parameters: { paths: [s3KeyPrefix], storageProvider: 'S3', bucket: 'persisted-bucket' } })
      );
    });

    it('should reject the task without running any deletion step when the tiles location cannot be resolved', async () => {
      const { deleteLayerHandler, queueClientMock, jobManagerClientMock, catalogClientMock, mapproxyClientMock } =
        await setupDeleteLayerHandlerTest();
      const job = structuredClone(deleteLayerJob);
      const task = structuredClone(deleteTaskForDeleteLayer);

      mapproxyClientMock.getLayerCache.mockResolvedValue(undefined);
      queueClientMock.reject.mockResolvedValue(undefined);

      await deleteLayerHandler.handleJobDelete(job, task);

      expect(catalogClientMock.deleteRecord).not.toHaveBeenCalled();
      expect(jobManagerClientMock.updateTask).not.toHaveBeenCalled();
      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, expect.stringContaining(layerName));
    });
  });

  describe('cleaner task idempotency', () => {
    it('should prevent duplicate tasks from being created', async () => {
      const { deleteLayerHandler, jobManagerClientMock, mapproxyClientMock } = await setupDeleteLayerHandlerTest();
      const job = structuredClone(deleteLayerJob);
      const task = structuredClone(deleteTaskForDeleteLayer);

      mapproxyClientMock.getLayerCache.mockResolvedValue(fsCacheResponse);
      jobManagerClientMock.updateTask.mockResolvedValue(undefined);
      jobManagerClientMock.createTaskForJob.mockResolvedValue(undefined);

      await deleteLayerHandler.handleJobDelete(job, task);

      expect(jobManagerClientMock.createTaskForJob).toHaveBeenCalledWith(
        job.id,
        expect.objectContaining({ type: tilesDeletionType, blockDuplication: true })
      );
    });
  });
});
