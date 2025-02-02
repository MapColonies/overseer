/* eslint-disable @typescript-eslint/unbound-method */
import { OperationStatus } from '@map-colonies/mc-priority-queue';
import { Grid, MergeTaskParameters } from '../../../../src/common/interfaces';
import { finalizeTaskForIngestionUpdate, initTaskForIngestionUpdate } from '../../mocks/tasksMockData';
import { updateAdditionalParamsSchema } from '../../../../src/utils/zod/schemas/jobParametersSchema';
import { registerDefaultConfig } from '../../mocks/configMock';
import { COMPLETED_PERCENTAGE } from '../../../../src/common/constants';
import { ingestionUpdateJob } from '../../mocks/jobsMockData';
import { setupUpdateJobHandlerTest } from './updateJobHandlerSetup';

describe('updateJobHandler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    registerDefaultConfig();
  });

  describe('handleJobInit', () => {
    it('should handle job init successfully', async () => {
      const { updateJobHandler, queueClientMock, taskBuilderMock } = setupUpdateJobHandlerTest();
      const job = structuredClone(ingestionUpdateJob);
      const task = initTaskForIngestionUpdate;

      const additionalParams = updateAdditionalParamsSchema.parse(job.parameters.additionalParams);

      const taskBuildParams = {
        inputFiles: job.parameters.inputFiles,
        taskMetadata: {
          layerRelativePath: `${job.internalId}/${additionalParams.displayPath}`,
          tileOutputFormat: additionalParams.tileOutputFormat,
          isNewTarget: false,
          grid: Grid.TWO_ON_ONE,
        },
        partsData: job.parameters.partsData,
      };

      const mergeTasks: AsyncGenerator<MergeTaskParameters, void, void> = (async function* () {})();

      taskBuilderMock.buildTasks.mockReturnValue(mergeTasks);
      taskBuilderMock.pushTasks.mockResolvedValue(undefined);
      queueClientMock.ack.mockResolvedValue(undefined);

      await updateJobHandler.handleJobInit(job, task);

      expect(taskBuilderMock.buildTasks).toHaveBeenCalledWith(taskBuildParams);
      expect(taskBuilderMock.pushTasks).toHaveBeenCalledWith(job.id, job.type, mergeTasks);
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
    });

    it('should handle job init failure and reject the task', async () => {
      const { updateJobHandler, taskBuilderMock, queueClientMock } = setupUpdateJobHandlerTest();

      const job = structuredClone(ingestionUpdateJob);
      const task = initTaskForIngestionUpdate;
      const tasks: AsyncGenerator<MergeTaskParameters, void, void> = (async function* () {})();

      const error = new Error('Test error');

      taskBuilderMock.buildTasks.mockReturnValue(tasks);
      taskBuilderMock.pushTasks.mockRejectedValue(error);
      queueClientMock.reject.mockResolvedValue(undefined);

      await updateJobHandler.handleJobInit(job, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, error.message);
    });
  });
  describe('handleJobFinalize', () => {
    it('should handle job finalize successfully', async () => {
      const { updateJobHandler, catalogClientMock, jobManagerClientMock, queueClientMock } = setupUpdateJobHandlerTest();
      const job = structuredClone(ingestionUpdateJob);
      const task = finalizeTaskForIngestionUpdate;

      catalogClientMock.update.mockResolvedValue(undefined);
      jobManagerClientMock.updateTask.mockResolvedValue(undefined);

      await updateJobHandler.handleJobFinalize(job, task);

      expect(catalogClientMock.update).toHaveBeenCalledWith(job);
      expect(jobManagerClientMock.updateTask).toHaveBeenCalledWith(job.id, task.id, { parameters: { updatedInCatalog: true } });
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
      expect(jobManagerClientMock.updateJob).toHaveBeenCalledWith(job.id, {
        status: OperationStatus.COMPLETED,
        percentage: COMPLETED_PERCENTAGE,
        reason: 'Job completed successfully',
      });
    });

    it('should handle job finalize failure and reject the task', async () => {
      const { updateJobHandler, queueClientMock, catalogClientMock } = setupUpdateJobHandlerTest();
      const job = structuredClone(ingestionUpdateJob);
      const task = finalizeTaskForIngestionUpdate;

      const error = new Error('Test error');

      queueClientMock.reject.mockResolvedValue(undefined);

      catalogClientMock.update.mockRejectedValue(error);

      await updateJobHandler.handleJobFinalize(job, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, error.message);
    });
  });
});
