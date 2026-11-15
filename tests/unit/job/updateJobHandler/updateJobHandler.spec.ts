/* eslint-disable @typescript-eslint/unbound-method */
import { updateAdditionalParamsSchema } from '@map-colonies/raster-shared';
import { finalizeTaskForIngestionUpdate, createTasksTaskForIngestionUpdate } from '../../mocks/tasksMockData';
import { createFakePolygonalGeometry } from '../../mocks/geometryMockData';
import { layerRecord } from '../../mocks/catalogClientMockData';
import { registerDefaultConfig } from '../../mocks/configMock';
import { ingestionUpdateFinalizeJob, ingestionUpdateJob } from '../../mocks/jobsMockData';
import { setupUpdateJobHandlerTest, type UpdateJobHandlerTestContext } from './updateJobHandlerSetup';

describe('updateJobHandler', () => {
  let updateJobHandler: UpdateJobHandlerTestContext['updateJobHandler'];
  let queueClientMock: UpdateJobHandlerTestContext['queueClientMock'];
  let taskBuilderMock: UpdateJobHandlerTestContext['taskBuilderMock'];
  let tileDeletionTaskManagerMock: UpdateJobHandlerTestContext['tileDeletionTaskManagerMock'];
  let readProductGeometryMock: UpdateJobHandlerTestContext['readProductGeometryMock'];
  let catalogClientMock: UpdateJobHandlerTestContext['catalogClientMock'];
  let jobManagerClientMock: UpdateJobHandlerTestContext['jobManagerClientMock'];
  let jobTrackerClientMock: UpdateJobHandlerTestContext['jobTrackerClientMock'];

  beforeEach(async () => {
    vi.resetAllMocks();
    registerDefaultConfig();

    const setup = await setupUpdateJobHandlerTest();
    updateJobHandler = setup.updateJobHandler;
    queueClientMock = setup.queueClientMock;
    taskBuilderMock = setup.taskBuilderMock;
    tileDeletionTaskManagerMock = setup.tileDeletionTaskManagerMock;
    readProductGeometryMock = setup.readProductGeometryMock;
    catalogClientMock = setup.catalogClientMock;
    jobManagerClientMock = setup.jobManagerClientMock;
    jobTrackerClientMock = setup.jobTrackerClientMock;
  });

  describe('handleJobInit', () => {
    it('should handle job init successfully', async () => {
      const job = structuredClone(ingestionUpdateJob);
      const task = createTasksTaskForIngestionUpdate;
      const productGeometry = createFakePolygonalGeometry();
      const additionalParams = updateAdditionalParamsSchema.parse(job.parameters.additionalParams);
      const layerRelativePath = `${job.internalId}/${additionalParams.displayPath}`;

      const polygonPartsEntityName = `${job.resourceId}_${String(job.productType).toLowerCase()}`;

      readProductGeometryMock.mockResolvedValue(productGeometry);
      catalogClientMock.findLayer.mockResolvedValue(layerRecord);
      jobManagerClientMock.updateJob.mockResolvedValue(undefined);
      tileDeletionTaskManagerMock.buildAndPushTasks.mockResolvedValue(undefined);
      taskBuilderMock.buildAndPushTasks.mockResolvedValue(undefined);
      queueClientMock.ack.mockResolvedValue(undefined);

      await updateJobHandler.handleJobInit(job, task);

      expect(tileDeletionTaskManagerMock.buildAndPushTasks).toHaveBeenCalledWith(job, task, polygonPartsEntityName, layerRelativePath);
      expect(taskBuilderMock.buildAndPushTasks).toHaveBeenCalledWith(job, task, productGeometry, layerRelativePath);
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
    });

    it('should record the previous layer footprint on the job before building tasks', async () => {
      const job = structuredClone(ingestionUpdateJob);
      const task = createTasksTaskForIngestionUpdate;

      readProductGeometryMock.mockResolvedValue(createFakePolygonalGeometry());
      catalogClientMock.findLayer.mockResolvedValue(layerRecord);
      jobManagerClientMock.updateJob.mockResolvedValue(undefined);
      tileDeletionTaskManagerMock.buildAndPushTasks.mockResolvedValue(undefined);
      taskBuilderMock.buildAndPushTasks.mockResolvedValue(undefined);
      queueClientMock.ack.mockResolvedValue(undefined);

      await updateJobHandler.handleJobInit(job, task);

      expect(catalogClientMock.findLayer).toHaveBeenCalledWith(job.internalId);
      // finalize reads it back from the job, by which time the catalog already holds the merged footprint
      expect(jobManagerClientMock.updateJob).toHaveBeenCalledWith(job.id, {
        parameters: {
          ...job.parameters,
          additionalParams: { ...job.parameters.additionalParams, previousFootprint: layerRecord.metadata.footprint },
        },
      });
      expect(jobManagerClientMock.updateJob.mock.invocationCallOrder[0]).toBeLessThan(taskBuilderMock.buildAndPushTasks.mock.invocationCallOrder[0]!);
    });

    it('should still build the tasks when the previous footprint cannot be recorded', async () => {
      const job = structuredClone(ingestionUpdateJob);
      const task = createTasksTaskForIngestionUpdate;

      readProductGeometryMock.mockResolvedValue(createFakePolygonalGeometry());
      catalogClientMock.findLayer.mockRejectedValue(new Error('catalog unavailable'));
      tileDeletionTaskManagerMock.buildAndPushTasks.mockResolvedValue(undefined);
      taskBuilderMock.buildAndPushTasks.mockResolvedValue(undefined);
      queueClientMock.ack.mockResolvedValue(undefined);

      await updateJobHandler.handleJobInit(job, task);

      const recordedFootprint = jobManagerClientMock.updateJob.mock.calls.some(
        ([, body]) =>
          (body as { parameters?: { additionalParams?: Record<string, unknown> } }).parameters?.additionalParams?.previousFootprint !== undefined
      );

      expect(recordedFootprint).toBe(false);
      expect(taskBuilderMock.buildAndPushTasks).toHaveBeenCalledTimes(1);
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
    });

    it('should reject task when mergeTaskManager.buildAndPushTasks throws', async () => {
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
