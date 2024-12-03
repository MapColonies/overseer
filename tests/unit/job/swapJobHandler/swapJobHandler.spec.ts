/* eslint-disable @typescript-eslint/unbound-method */
import crypto from 'crypto';
import { ZodError } from 'zod';
import { OperationStatus } from '@map-colonies/mc-priority-queue';
import { swapUpdateAdditionalParamsSchema, updateAdditionalParamsSchema } from '../../../../src/utils/zod/schemas/jobParametersSchema';
import { registerDefaultConfig } from '../../mocks/configMock';
import { Grid, MergeTaskParameters, SeedJobParams, LayerName } from '../../../../src/common/interfaces';
import { COMPLETED_PERCENTAGE, JOB_SUCCESS_MESSAGE } from '../../../../src/common/constants';
import { finalizeTaskForIngestionSwapUpdate } from '../../mocks/tasksMockData';
import { ingestionSwapUpdateJob } from '../../mocks/jobsMockData';
import { setupSwapJobHandlerTest } from './swapJobHandlerSetup';

describe('swapJobHandler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    registerDefaultConfig();
  });

  describe('handleJobInit', () => {
    it('should handle job init successfully', async () => {
      const { swapJobHandler, queueClientMock, taskBuilderMock, jobManagerClientMock } = setupSwapJobHandlerTest();
      const job = structuredClone(ingestionSwapUpdateJob);
      const taskId = '291bf779-efe0-42bd-8357-aaede47e4d37';

      const additionalParams = swapUpdateAdditionalParamsSchema.parse(job.parameters.additionalParams);

      const newDisplayPath = crypto.randomUUID();

      jest.spyOn(crypto, 'randomUUID').mockReturnValue(newDisplayPath);

      const taskBuildParams = {
        inputFiles: job.parameters.inputFiles,
        taskMetadata: {
          layerRelativePath: `${job.internalId}/${newDisplayPath}`,
          tileOutputFormat: additionalParams.tileOutputFormat,
          isNewTarget: true,
          grid: Grid.TWO_ON_ONE,
        },
        partsData: job.parameters.partsData,
      };

      const mergeTasks: AsyncGenerator<MergeTaskParameters, void, void> = (async function* () {})();

      taskBuilderMock.buildTasks.mockReturnValue(mergeTasks);
      taskBuilderMock.pushTasks.mockResolvedValue(undefined);
      queueClientMock.ack.mockResolvedValue(undefined);

      await swapJobHandler.handleJobInit(job, taskId);

      expect(taskBuilderMock.buildTasks).toHaveBeenCalledWith(taskBuildParams);
      expect(taskBuilderMock.pushTasks).toHaveBeenCalledWith(job.id, mergeTasks);
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, taskId);
      expect(jobManagerClientMock.updateJob).toHaveBeenCalledWith(job.id, {
        parameters: { ...job.parameters, additionalParams: { ...additionalParams, displayPath: newDisplayPath } },
      });
    });

    it('should handle job init failure and reject the task', async () => {
      const { swapJobHandler, taskBuilderMock, queueClientMock } = setupSwapJobHandlerTest();

      const job = structuredClone(ingestionSwapUpdateJob);

      const taskId = '291bf779-efe0-42bd-8357-aaede47e4d37';
      const tasks: AsyncGenerator<MergeTaskParameters, void, void> = (async function* () {})();

      const error = new Error('Test error');

      taskBuilderMock.buildTasks.mockReturnValue(tasks);
      taskBuilderMock.pushTasks.mockRejectedValue(error);
      queueClientMock.reject.mockResolvedValue(undefined);

      await swapJobHandler.handleJobInit(job, taskId);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, taskId, true, error.message);
    });

    it('should handle job init failure with ZodError and Failed the job', async () => {
      const { swapJobHandler, jobManagerClientMock, queueClientMock } = setupSwapJobHandlerTest();
      const job = structuredClone(ingestionSwapUpdateJob);
      job.parameters.additionalParams = { wrongField: 'wrongValue' };
      const taskId = '291bf779-efe0-42bd-8357-aaede47e4d37';
      const validAdditionalParamsSpy = jest.spyOn(swapUpdateAdditionalParamsSchema, 'parse');

      await swapJobHandler.handleJobInit(job, taskId);

      expect(validAdditionalParamsSpy).toThrow(ZodError);
      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, taskId, false, expect.any(String));
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      expect(jobManagerClientMock.updateJob).toHaveBeenCalledWith(job.id, { status: OperationStatus.FAILED, reason: expect.any(String) });
    });
  });

  describe('handleJobFinalize', () => {
    it('should handle job finalize successfully', async () => {
      const { swapJobHandler, queueClientMock, jobManagerClientMock, mapproxyClientMock, catalogClientMock, seedingJobCreatorMock } =
        setupSwapJobHandlerTest();
      const job = structuredClone(ingestionSwapUpdateJob);
      job.parameters.additionalParams = { displayPath: '391cf779-dfe0-42bd-9357-aaede47e4d37', ...job.parameters.additionalParams };
      const task = { ...finalizeTaskForIngestionSwapUpdate };

      const { displayPath, tileOutputFormat } = updateAdditionalParamsSchema.parse(job.parameters.additionalParams);
      const layerName: LayerName = `${job.resourceId}-${job.productType}`;
      const layerRelativePath = `${job.internalId}/${displayPath}`;
      const createSeedingJobParams: SeedJobParams = {
        mode: 'clean',
        ingestionJob: job,
        layerName,
      };

      jobManagerClientMock.updateJob.mockResolvedValue(undefined);
      jobManagerClientMock.updateTask.mockResolvedValue(undefined);
      mapproxyClientMock.update.mockResolvedValue(undefined);
      catalogClientMock.update.mockResolvedValue(undefined);

      await swapJobHandler.handleJobFinalize(job, task);

      expect(mapproxyClientMock.update).toHaveBeenCalledWith(layerName, layerRelativePath, tileOutputFormat);
      expect(jobManagerClientMock.updateTask).toHaveBeenCalledWith(job.id, task.id, {
        parameters: { updatedInCatalog: false, updatedInMapproxy: true },
      });
      expect(catalogClientMock.update).toHaveBeenCalledWith(job);
      expect(jobManagerClientMock.updateTask).toHaveBeenCalledWith(job.id, task.id, {
        parameters: { updatedInCatalog: true, updatedInMapproxy: true },
      });
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
      expect(jobManagerClientMock.updateJob).toHaveBeenCalledWith(job.id, {
        status: OperationStatus.COMPLETED,
        percentage: COMPLETED_PERCENTAGE,
        reason: JOB_SUCCESS_MESSAGE,
      });
      expect(seedingJobCreatorMock.create).toHaveBeenCalledWith(createSeedingJobParams);
    });

    it('should handle job finalize failure and reject the task', async () => {
      const { swapJobHandler, queueClientMock, catalogClientMock } = setupSwapJobHandlerTest();
      const job = structuredClone(ingestionSwapUpdateJob);
      job.parameters.additionalParams = { displayPath: '391cf779-dfe0-42bd-9357-aaede47e4d37', ...job.parameters.additionalParams };
      const task = { ...finalizeTaskForIngestionSwapUpdate };

      const error = new Error('Test error');

      queueClientMock.reject.mockResolvedValue(undefined);

      catalogClientMock.update.mockRejectedValue(error);

      await swapJobHandler.handleJobFinalize(job, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, error.message);
    });

    it('should handle job finalize failure and reject the task (zod validation error)', async () => {
      const { swapJobHandler, queueClientMock } = setupSwapJobHandlerTest();
      const job = structuredClone(ingestionSwapUpdateJob);
      const task = { ...finalizeTaskForIngestionSwapUpdate };

      queueClientMock.reject.mockResolvedValue(undefined);

      await swapJobHandler.handleJobFinalize(job, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, false, expect.any(String));
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      expect(queueClientMock.jobManagerClient.updateJob).toHaveBeenCalledWith(job.id, { status: OperationStatus.FAILED, reason: expect.any(String) });
    });
  });
});
