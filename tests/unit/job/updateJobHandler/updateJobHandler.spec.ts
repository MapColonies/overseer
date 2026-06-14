/* eslint-disable @typescript-eslint/unbound-method */
import { updateAdditionalParamsSchema } from '@map-colonies/raster-shared';
import { finalizeTaskForIngestionUpdate, createTasksTaskForIngestionUpdate } from '../../mocks/tasksMockData';
import { createFakePolygonalGeometry } from '../../mocks/geometryMockData';
import { registerDefaultConfig } from '../../mocks/configMock';
import { ingestionUpdateFinalizeJob, ingestionUpdateJob } from '../../mocks/jobsMockData';
import { setupUpdateJobHandlerTest } from './updateJobHandlerSetup';

describe('updateJobHandler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    registerDefaultConfig();
  });

  describe('handleJobInit', () => {
    it('should handle job init successfully', async () => {
      const { updateJobHandler, queueClientMock, taskBuilderMock, tileDeletionTaskManagerMock, readProductGeometryMock } =
        setupUpdateJobHandlerTest();
      const job = structuredClone(ingestionUpdateJob);
      const task = createTasksTaskForIngestionUpdate;
      const productGeometry = createFakePolygonalGeometry();
      const additionalParams = updateAdditionalParamsSchema.parse(job.parameters.additionalParams);
      const layerRelativePath = `${job.internalId}/${additionalParams.displayPath}`;

      const polygonPartsEntityName = `${job.resourceId}_${String(job.productType).toLowerCase()}`;

      readProductGeometryMock.mockResolvedValue(productGeometry);
      tileDeletionTaskManagerMock.buildAndPushTasks.mockResolvedValue(undefined);
      taskBuilderMock.buildAndPushTasks.mockResolvedValue(undefined);
      queueClientMock.ack.mockResolvedValue(undefined);

      await updateJobHandler.handleJobInit(job, task);

      expect(tileDeletionTaskManagerMock.buildAndPushTasks).toHaveBeenCalledWith(job, task, polygonPartsEntityName, layerRelativePath);
      expect(taskBuilderMock.buildAndPushTasks).toHaveBeenCalledWith(job, task, productGeometry, layerRelativePath);
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
    });

    it('should reject task when mergeTaskManager.buildAndPushTasks throws', async () => {
      const { updateJobHandler, taskBuilderMock, tileDeletionTaskManagerMock, queueClientMock, readProductGeometryMock } =
        setupUpdateJobHandlerTest();
      const job = structuredClone(ingestionUpdateJob);
      const task = createTasksTaskForIngestionUpdate;
      const error = new Error('Test error');

      readProductGeometryMock.mockResolvedValue(createFakePolygonalGeometry());
      tileDeletionTaskManagerMock.buildAndPushTasks.mockResolvedValue(undefined);
      taskBuilderMock.buildAndPushTasks.mockRejectedValue(error);
      queueClientMock.reject.mockResolvedValue(undefined);

      await updateJobHandler.handleJobInit(job, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, error.message);
    });

    it('should reject task when tileDeletionTaskManager.buildAndPushTasks throws', async () => {
      const { updateJobHandler, tileDeletionTaskManagerMock, queueClientMock, readProductGeometryMock } = setupUpdateJobHandlerTest();
      const job = structuredClone(ingestionUpdateJob);
      const task = createTasksTaskForIngestionUpdate;
      const error = new Error('Deletion task error');

      readProductGeometryMock.mockResolvedValue(createFakePolygonalGeometry());
      tileDeletionTaskManagerMock.buildAndPushTasks.mockRejectedValue(error);
      queueClientMock.reject.mockResolvedValue(undefined);

      await updateJobHandler.handleJobInit(job, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, error.message);
    });
  });

  describe('handleJobFinalize', () => {
    it('should handle job finalize successfully', async () => {
      const { updateJobHandler, catalogClientMock, jobManagerClientMock, queueClientMock, jobTrackerClientMock } = setupUpdateJobHandlerTest();
      const job = structuredClone(ingestionUpdateFinalizeJob);
      const task = finalizeTaskForIngestionUpdate;
      const entityName = `${job.resourceId}_${job.productType.toLowerCase()}`;

      catalogClientMock.update.mockResolvedValue(undefined);
      jobManagerClientMock.updateTask.mockResolvedValue(undefined);

      await updateJobHandler.handleJobFinalize(job, task);

      expect(catalogClientMock.update).toHaveBeenCalledWith(job, entityName);
      expect(jobManagerClientMock.updateTask).toHaveBeenCalledWith(job.id, task.id, {
        parameters: { processedParts: true, updatedInCatalog: false },
      });
      expect(jobManagerClientMock.updateTask).toHaveBeenCalledWith(job.id, task.id, { parameters: { processedParts: true, updatedInCatalog: true } });
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
      expect(jobTrackerClientMock.notify).toHaveBeenCalledWith(task);
    });

    it('should handle job finalize failure and reject the task', async () => {
      const { updateJobHandler, queueClientMock, catalogClientMock } = setupUpdateJobHandlerTest();
      const job = structuredClone(ingestionUpdateFinalizeJob);
      const task = finalizeTaskForIngestionUpdate;

      const error = new Error('Test error');

      queueClientMock.reject.mockResolvedValue(undefined);

      catalogClientMock.update.mockRejectedValue(error);

      await updateJobHandler.handleJobFinalize(job, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, error.message);
    });
  });
});
