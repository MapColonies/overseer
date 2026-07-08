/* eslint-disable @typescript-eslint/unbound-method */
import { getEntityName } from '@map-colonies/raster-shared';
import { registerDefaultConfig, setValue } from '../../mocks/configMock';
import { deleteLayerJob } from '../../mocks/jobsMockData';
import { deleteTaskForDeleteLayer } from '../../mocks/tasksMockData';
import { jobTrackerClientMock } from '../../mocks/jobManagerMocks';
import { setupDeleteLayerHandlerTest } from './deleteLayerHandlerSetup';

describe('DeleteLayerHandler', () => {
  const layerName = `${deleteLayerJob.resourceId}-${deleteLayerJob.productType}`;
  const entityName = getEntityName(deleteLayerJob.resourceId, deleteLayerJob.productType);
  const tilesDeletionType = 'tiles-deletion';

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

      jobManagerClientMock.updateTask.mockResolvedValue(undefined);
      jobManagerClientMock.findTasks.mockResolvedValue([]);
      jobManagerClientMock.createTaskForJob.mockResolvedValue(undefined);
      queueClientMock.ack.mockResolvedValue(undefined);

      const completeTaskSpy = vi.spyOn(deleteLayerHandler as unknown as { completeTask: (...args: unknown[]) => unknown }, 'completeTask');

      await deleteLayerHandler.handleJobDelete(job, task);

      expect(catalogClientMock.deleteRecord).toHaveBeenCalledWith(job.internalId);
      expect(geoserverClientMock.unpublishLayer).toHaveBeenCalledWith(layerName);
      expect(polygonPartsManagerClientMock.deleteEntities).toHaveBeenCalledWith(entityName);
      expect(mapproxyClientMock.removeLayer).toHaveBeenCalledWith(layerName);

      // each step persisted immediately (§4.2, §6)
      expect(jobManagerClientMock.updateTask).toHaveBeenCalledTimes(4);
      expect(jobManagerClientMock.createTaskForJob).toHaveBeenCalledWith(job.id, expect.objectContaining({ type: tilesDeletionType }));
      expect(completeTaskSpy).toHaveBeenCalledWith(job, task, expect.any(Object));
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
    });

    it('should skip steps already marked completed on a redelivered task', async () => {
      const { deleteLayerHandler, jobManagerClientMock, catalogClientMock, geoserverClientMock, polygonPartsManagerClientMock, mapproxyClientMock } =
        await setupDeleteLayerHandlerTest();
      const job = structuredClone(deleteLayerJob);
      const task = structuredClone(deleteTaskForDeleteLayer);
      task.parameters = { deleteFromCatalog: true, deleteFromGeoserver: true, deletePolygonParts: false, deleteFromMapproxy: false };

      jobManagerClientMock.updateTask.mockResolvedValue(undefined);
      jobManagerClientMock.findTasks.mockResolvedValue([]);
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
      mapproxyClientMock.removeLayer.mockRejectedValue(new Error('mapproxy down'));

      await deleteLayerHandler.handleJobDelete(job, task);

      expect(jobManagerClientMock.createTaskForJob).not.toHaveBeenCalled();
    });

    it('should reject the task when a deletion step fails', async () => {
      const { deleteLayerHandler, queueClientMock, catalogClientMock } = await setupDeleteLayerHandlerTest();
      const job = structuredClone(deleteLayerJob);
      const task = structuredClone(deleteTaskForDeleteLayer);
      const error = new Error('catalog unreachable');

      catalogClientMock.deleteRecord.mockRejectedValue(error);
      queueClientMock.reject.mockResolvedValue(undefined);

      await deleteLayerHandler.handleJobDelete(job, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, error.message);
    });
  });

  describe('tiles bucket resolution', () => {
    it('should not resolve a bucket for the FS provider', async () => {
      setValue('tilesStorageProvider', 'FS');
      const { deleteLayerHandler, jobManagerClientMock, mapproxyClientMock } = await setupDeleteLayerHandlerTest();
      const job = structuredClone(deleteLayerJob);
      const task = structuredClone(deleteTaskForDeleteLayer);

      jobManagerClientMock.updateTask.mockResolvedValue(undefined);
      jobManagerClientMock.findTasks.mockResolvedValue([]);
      jobManagerClientMock.createTaskForJob.mockResolvedValue(undefined);

      await deleteLayerHandler.handleJobDelete(job, task);

      expect(mapproxyClientMock.getS3CacheBucketName).not.toHaveBeenCalled();
      expect(jobManagerClientMock.createTaskForJob).toHaveBeenCalledWith(
        job.id,
        expect.objectContaining({ parameters: { paths: [job.internalId], storageProvider: 'FS' } })
      );
    });

    it('should resolve the bucket from the mapproxy cache before the layer is removed (S3)', async () => {
      setValue('tilesStorageProvider', 'S3');
      const { deleteLayerHandler, jobManagerClientMock, mapproxyClientMock } = await setupDeleteLayerHandlerTest();
      const job = structuredClone(deleteLayerJob);
      const task = structuredClone(deleteTaskForDeleteLayer);

      mapproxyClientMock.getS3CacheBucketName.mockResolvedValue('mapproxy-cache-bucket');
      jobManagerClientMock.updateTask.mockResolvedValue(undefined);
      jobManagerClientMock.findTasks.mockResolvedValue([]);
      jobManagerClientMock.createTaskForJob.mockResolvedValue(undefined);

      await deleteLayerHandler.handleJobDelete(job, task);

      // key design point: the cache must be read BEFORE removeLayer
      expect(mapproxyClientMock.getS3CacheBucketName).toHaveBeenCalledTimes(1);
      expect(mapproxyClientMock.removeLayer).toHaveBeenCalledTimes(1);

      const cacheOrder = mapproxyClientMock.getS3CacheBucketName.mock.invocationCallOrder[0] ?? 0;
      const removeOrder = mapproxyClientMock.removeLayer.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER;

      expect(cacheOrder).toBeLessThan(removeOrder);
      expect(jobManagerClientMock.createTaskForJob).toHaveBeenCalledWith(
        job.id,
        expect.objectContaining({ parameters: { paths: [job.internalId], storageProvider: 'S3', bucket: 'mapproxy-cache-bucket' } })
      );
    });

    it('should fall back to the configured tiles bucket when mapproxy cannot resolve it (S3)', async () => {
      setValue('tilesStorageProvider', 'S3');
      setValue('S3.tilesBucket', 'config-fallback-bucket');
      const { deleteLayerHandler, jobManagerClientMock, mapproxyClientMock } = await setupDeleteLayerHandlerTest();
      const job = structuredClone(deleteLayerJob);
      const task = structuredClone(deleteTaskForDeleteLayer);

      mapproxyClientMock.getS3CacheBucketName.mockResolvedValue(undefined);
      jobManagerClientMock.updateTask.mockResolvedValue(undefined);
      jobManagerClientMock.findTasks.mockResolvedValue([]);
      jobManagerClientMock.createTaskForJob.mockResolvedValue(undefined);

      await deleteLayerHandler.handleJobDelete(job, task);

      expect(jobManagerClientMock.createTaskForJob).toHaveBeenCalledWith(
        job.id,
        expect.objectContaining({ parameters: { paths: [job.internalId], storageProvider: 'S3', bucket: 'config-fallback-bucket' } })
      );
    });
  });

  describe('cleaner task idempotency', () => {
    it('should not create a duplicate tiles-deletion task when one already exists', async () => {
      const { deleteLayerHandler, jobManagerClientMock } = await setupDeleteLayerHandlerTest();
      const job = structuredClone(deleteLayerJob);
      const task = structuredClone(deleteTaskForDeleteLayer);

      jobManagerClientMock.updateTask.mockResolvedValue(undefined);
      jobManagerClientMock.findTasks.mockResolvedValue([{ id: 'existing-tiles-task' }] as never);

      await deleteLayerHandler.handleJobDelete(job, task);

      expect(jobManagerClientMock.findTasks).toHaveBeenCalledWith({ jobId: job.id, type: tilesDeletionType });
      expect(jobManagerClientMock.createTaskForJob).not.toHaveBeenCalled();
    });
  });
});
