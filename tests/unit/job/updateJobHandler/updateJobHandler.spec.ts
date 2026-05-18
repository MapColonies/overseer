/* eslint-disable @typescript-eslint/unbound-method */
import { updateAdditionalParamsSchema } from '@map-colonies/raster-shared';
import { Grid, MergeTask, MergeTilesTaskParams, DeletionTilesTaskParams } from '../../../../src/common/interfaces';
import {
  finalizeTaskForIngestionUpdate,
  createTasksTaskForIngestionUpdate,
  validationTaskForIngestionUpdate,
  validationTaskWithResolutionErrorsAndReport,
  validationTaskWithResolutionErrorsNoReportUrl,
} from '../../mocks/tasksMockData';
import { createFakePolygonalGeometry } from '../../mocks/geometryMockData';
import { registerDefaultConfig } from '../../mocks/configMock';
import { ingestionUpdateFinalizeJob, ingestionUpdateJob } from '../../mocks/jobsMockData';
import { setupUpdateJobHandlerTest } from './updateJobHandlerSetup';

describe('updateJobHandler', () => {
  const mergeTasks: AsyncGenerator<MergeTask, void, void> = (async function* () { })();
  const deletionTasks = (async function* () { })();
  beforeEach(() => {
    jest.resetAllMocks();
    registerDefaultConfig();
  });

  describe('handleJobInit', () => {
    it('should handle job init successfully', async () => {
      const { updateJobHandler, queueClientMock, taskBuilderMock, readProductGeometryMock, jobManagerClientMock } = setupUpdateJobHandlerTest();
      const job = structuredClone(ingestionUpdateJob);
      const task = createTasksTaskForIngestionUpdate;
      const productGeometry = createFakePolygonalGeometry();

      const additionalParams = updateAdditionalParamsSchema.parse(job.parameters.additionalParams);

      const taskBuildParams: MergeTilesTaskParams = {
        inputFiles: job.parameters.inputFiles,
        taskMetadata: {
          layerRelativePath: `${job.internalId}/${additionalParams.displayPath}`,
          tileOutputFormat: additionalParams.tileOutputFormat,
          isNewTarget: false,
          grid: Grid.TWO_ON_ONE,
        },
        ingestionResolution: job.parameters.ingestionResolution,
        productGeometry,
      };

      jobManagerClientMock.findTasks.mockResolvedValue([validationTaskForIngestionUpdate]);
      readProductGeometryMock.mockResolvedValue(productGeometry);
      taskBuilderMock.buildTasks.mockReturnValue(mergeTasks);
      taskBuilderMock.pushTasks.mockResolvedValue(undefined);
      queueClientMock.ack.mockResolvedValue(undefined);

      await updateJobHandler.handleJobInit(job, task);

      expect(taskBuilderMock.buildTasks).toHaveBeenCalledWith(taskBuildParams, task);
      expect(taskBuilderMock.pushTasks).toHaveBeenCalledWith(task, job.id, job.type, mergeTasks);
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
    });

    it('should handle job init failure and reject the task', async () => {
      const { updateJobHandler, taskBuilderMock, queueClientMock, jobManagerClientMock } = setupUpdateJobHandlerTest();

      const job = structuredClone(ingestionUpdateJob);
      const task = createTasksTaskForIngestionUpdate;

      const error = new Error('Test error');

      jobManagerClientMock.findTasks.mockResolvedValue([validationTaskForIngestionUpdate]);
      taskBuilderMock.buildTasks.mockReturnValue(mergeTasks);
      taskBuilderMock.pushTasks.mockRejectedValue(error);
      queueClientMock.reject.mockResolvedValue(undefined);

      await updateJobHandler.handleJobInit(job, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, error.message);
    });

    it('should build and push deletion tasks when validation task has resolution errors and report URL', async () => {
      const {
        updateJobHandler,
        queueClientMock,
        taskBuilderMock,
        tileDeletionTaskManagerMock,
        readProductGeometryMock,
        jobManagerClientMock,
      } = setupUpdateJobHandlerTest();
      const job = structuredClone(ingestionUpdateJob);
      const task = createTasksTaskForIngestionUpdate;
      const productGeometry = createFakePolygonalGeometry();
      const additionalParams = updateAdditionalParamsSchema.parse(job.parameters.additionalParams);
      const layerRelativePath = `${job.internalId}/${additionalParams.displayPath}`;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const polygonPartsEntityName = `${job.resourceId}_${job.productType!.toLowerCase()}`;

      const expectedDeletionTaskBuildParams: DeletionTilesTaskParams = {
        polygonPartsEntityName,
        layerRelativePath,
        ingestionResolution: job.parameters.ingestionResolution,
        tileOutputFormat: additionalParams.tileOutputFormat,
        reportUrl: validationTaskWithResolutionErrorsAndReport.parameters.report!.url,
      };

      jobManagerClientMock.findTasks.mockResolvedValue([validationTaskWithResolutionErrorsAndReport]);
      readProductGeometryMock.mockResolvedValue(productGeometry);
      taskBuilderMock.buildTasks.mockReturnValue(mergeTasks);
      taskBuilderMock.pushTasks.mockResolvedValue(undefined);
      tileDeletionTaskManagerMock.buildTasks.mockReturnValue(deletionTasks);
      tileDeletionTaskManagerMock.pushTasks.mockResolvedValue(undefined);
      queueClientMock.ack.mockResolvedValue(undefined);

      await updateJobHandler.handleJobInit(job, task);

      expect(tileDeletionTaskManagerMock.buildTasks).toHaveBeenCalledWith(task, expectedDeletionTaskBuildParams);
      expect(tileDeletionTaskManagerMock.pushTasks).toHaveBeenCalledWith(job.id, job.type, deletionTasks);
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
    });

    it('should skip deletion tasks when validation task has no resolution errors', async () => {
      const {
        updateJobHandler,
        queueClientMock,
        taskBuilderMock,
        tileDeletionTaskManagerMock,
        readProductGeometryMock,
        jobManagerClientMock,
      } = setupUpdateJobHandlerTest();
      const job = structuredClone(ingestionUpdateJob);
      const task = createTasksTaskForIngestionUpdate;
      const productGeometry = createFakePolygonalGeometry();

      jobManagerClientMock.findTasks.mockResolvedValue([validationTaskForIngestionUpdate]);
      readProductGeometryMock.mockResolvedValue(productGeometry);
      taskBuilderMock.buildTasks.mockReturnValue(mergeTasks);
      taskBuilderMock.pushTasks.mockResolvedValue(undefined);
      queueClientMock.ack.mockResolvedValue(undefined);

      await updateJobHandler.handleJobInit(job, task);

      expect(tileDeletionTaskManagerMock.buildTasks).not.toHaveBeenCalled();
      expect(tileDeletionTaskManagerMock.pushTasks).not.toHaveBeenCalled();
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
    });

    it('should skip deletion tasks when validation task has resolution errors but report URL is missing', async () => {
      const {
        updateJobHandler,
        queueClientMock,
        taskBuilderMock,
        tileDeletionTaskManagerMock,
        readProductGeometryMock,
        jobManagerClientMock,
      } = setupUpdateJobHandlerTest();
      const job = structuredClone(ingestionUpdateJob);
      const task = createTasksTaskForIngestionUpdate;
      const productGeometry = createFakePolygonalGeometry();

      jobManagerClientMock.findTasks.mockResolvedValue([validationTaskWithResolutionErrorsNoReportUrl]);
      readProductGeometryMock.mockResolvedValue(productGeometry);
      taskBuilderMock.buildTasks.mockReturnValue(mergeTasks);
      taskBuilderMock.pushTasks.mockResolvedValue(undefined);
      queueClientMock.ack.mockResolvedValue(undefined);

      await updateJobHandler.handleJobInit(job, task);

      expect(tileDeletionTaskManagerMock.buildTasks).not.toHaveBeenCalled();
      expect(tileDeletionTaskManagerMock.pushTasks).not.toHaveBeenCalled();
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
    });

    it('should reject task when no validation task is found', async () => {
      const { updateJobHandler, queueClientMock, readProductGeometryMock, jobManagerClientMock } = setupUpdateJobHandlerTest();
      const job = structuredClone(ingestionUpdateJob);
      const task = createTasksTaskForIngestionUpdate;
      const productGeometry = createFakePolygonalGeometry();

      jobManagerClientMock.findTasks.mockResolvedValue([]);
      readProductGeometryMock.mockResolvedValue(productGeometry);
      queueClientMock.reject.mockResolvedValue(undefined);

      await updateJobHandler.handleJobInit(job, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, expect.any(String));
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
