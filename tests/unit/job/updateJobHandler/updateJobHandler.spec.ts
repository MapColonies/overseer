/* eslint-disable @typescript-eslint/unbound-method */
import { ZodError } from 'zod';
import { OperationStatus } from '@map-colonies/mc-priority-queue';
import { TileOutputFormat } from '@map-colonies/mc-model-types';
import { Grid, IMergeTaskParameters } from '../../../../src/common/interfaces';
import { finalizeTaskForIngestionUpdate } from '../../mocks/tasksMockData';
import { updateAdditionalParamsSchema } from '../../../../src/utils/zod/schemas/jobParametersSchema';
import { registerDefaultConfig } from '../../mocks/configMock';
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
      const job = ingestionUpdateJob;
      const taskId = '291bf779-efe0-42bd-8357-aaede47e4d37';

      const additionalParams = updateAdditionalParamsSchema.parse(job.parameters.additionalParams);

      const taskBuildParams = {
        inputFiles: job.parameters.inputFiles,
        taskMetadata: {
          layerRelativePath: `${job.internalId}/${additionalParams.displayPath}`,
          tileOutputFormat: additionalParams.tileOutputFormat,
          isNewTarget: true,
          grid: Grid.TWO_ON_ONE,
        },
        partsData: job.parameters.partsData,
      };

      const mergeTasks: AsyncGenerator<IMergeTaskParameters, void, void> = (async function* () {})();

      taskBuilderMock.buildTasks.mockReturnValue(mergeTasks);
      taskBuilderMock.pushTasks.mockResolvedValue(undefined);
      queueClientMock.ack.mockResolvedValue(undefined);

      await updateJobHandler.handleJobInit(job, taskId);

      expect(taskBuilderMock.buildTasks).toHaveBeenCalledWith(taskBuildParams);
      expect(taskBuilderMock.pushTasks).toHaveBeenCalledWith(job.id, mergeTasks);
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, taskId);
    });

    it('should handle job init failure and reject the task', async () => {
      const { updateJobHandler, taskBuilderMock, queueClientMock } = setupUpdateJobHandlerTest();

      const job = { ...ingestionUpdateJob };

      const taskId = '7e630dea-ea29-4b30-a88e-5407bf67d1bc';
      const tasks: AsyncGenerator<IMergeTaskParameters, void, void> = (async function* () {})();

      const error = new Error('Test error');

      taskBuilderMock.buildTasks.mockReturnValue(tasks);
      taskBuilderMock.pushTasks.mockRejectedValue(error);
      queueClientMock.reject.mockResolvedValue(undefined);

      await updateJobHandler.handleJobInit(job, taskId);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, taskId, true, error.message);
    });

    it('should handle job init failure with ZodError and Failed the job', async () => {
      const { updateJobHandler, jobManagerClientMock, queueClientMock } = setupUpdateJobHandlerTest();
      const job = ingestionUpdateJob;
      job.parameters.additionalParams = { wrongField: 'wrongValue' };
      const taskId = '291bf779-efe0-42bd-8357-aaede47e4d37';
      const validAdditionalParamsSpy = jest.spyOn(updateAdditionalParamsSchema, 'parse');

      await updateJobHandler.handleJobInit(job, taskId);

      expect(validAdditionalParamsSpy).toThrow(ZodError);
      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, taskId, false, expect.any(String));
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      expect(jobManagerClientMock.updateJob).toHaveBeenCalledWith(job.id, { status: OperationStatus.FAILED, reason: expect.any(String) });
    });
  });
  describe('handleJobFinalize', () => {
    it('should throw not implemented Error', async () => {
      const { updateJobHandler } = setupUpdateJobHandlerTest();

      await expect(updateJobHandler.handleJobFinalize(ingestionUpdateJob, finalizeTaskForIngestionUpdate)).rejects.toBe('not implemented');
    });
  });
});
