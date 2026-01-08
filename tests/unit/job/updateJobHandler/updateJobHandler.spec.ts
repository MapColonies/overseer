/* eslint-disable @typescript-eslint/unbound-method */
import { updateAdditionalParamsSchema } from '@map-colonies/raster-shared';
import { Grid, MergeTask, MergeTilesTaskParams } from '../../../../src/common/interfaces';
import { finalizeTaskForIngestionUpdate, createTasksTaskForIngestionUpdate } from '../../mocks/tasksMockData';
import { createFakePolygonalGeometry } from '../../mocks/geometryMockData';
import { registerDefaultConfig } from '../../mocks/configMock';
import { ingestionUpdateFinalizeJob, ingestionUpdateJob } from '../../mocks/jobsMockData';
import { setupUpdateJobHandlerTest } from './updateJobHandlerSetup';

describe('updateJobHandler', () => {
  const mergeTasks: AsyncGenerator<MergeTask, void, void> = (async function* () {})();
  beforeEach(() => {
    jest.resetAllMocks();
    registerDefaultConfig();
  });

  describe('handleJobInit', () => {
    it('should handle job init successfully', async () => {
      const { updateJobHandler, queueClientMock, taskBuilderMock, readProductGeometry } = setupUpdateJobHandlerTest();
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

      readProductGeometry.mockResolvedValue(productGeometry);
      taskBuilderMock.buildTasks.mockReturnValue(mergeTasks);
      taskBuilderMock.pushTasks.mockResolvedValue(undefined);
      queueClientMock.ack.mockResolvedValue(undefined);

      await updateJobHandler.handleJobInit(job, task);

      expect(taskBuilderMock.buildTasks).toHaveBeenCalledWith(taskBuildParams, task);
      expect(taskBuilderMock.pushTasks).toHaveBeenCalledWith(task, job.id, job.type, mergeTasks);
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
    });

    it('should handle job init failure and reject the task', async () => {
      const { updateJobHandler, taskBuilderMock, queueClientMock } = setupUpdateJobHandlerTest();

      const job = structuredClone(ingestionUpdateJob);
      const task = createTasksTaskForIngestionUpdate;

      const error = new Error('Test error');

      taskBuilderMock.buildTasks.mockReturnValue(mergeTasks);
      taskBuilderMock.pushTasks.mockRejectedValue(error);
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
