/* eslint-disable @typescript-eslint/unbound-method */
import crypto from 'crypto';
import { LayerName, RasterProductTypes, swapUpdateAdditionalParamsSchema } from '@map-colonies/raster-shared';
import { OperationStatus } from '@map-colonies/mc-priority-queue';
import { registerDefaultConfig } from '../../mocks/configMock';
import { Grid, MergeTaskParameters, SeedJobParams } from '../../../../src/common/interfaces';
import { COMPLETED_PERCENTAGE, JOB_SUCCESS_MESSAGE, SeedMode } from '../../../../src/common/constants';
import { finalizeTaskForIngestionSwapUpdate, initTaskForIngestionSwapUpdate } from '../../mocks/tasksMockData';
import { ingestionSwapUpdateFinalizeJob, ingestionSwapUpdateJob } from '../../mocks/jobsMockData';
import { setupSwapJobHandlerTest } from './swapJobHandlerSetup';

describe('swapJobHandler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    registerDefaultConfig();
  });

  describe('handleJobInit', () => {
    it('should handle job init successfully', async () => {
      const { swapJobHandler, queueClientMock, taskBuilderMock } = setupSwapJobHandlerTest();
      const job = structuredClone(ingestionSwapUpdateJob);
      const task = initTaskForIngestionSwapUpdate;

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

      const completeInitTaskSpy = jest.spyOn(swapJobHandler as unknown as { completeInitTask: jest.Func }, 'completeInitTask');

      await swapJobHandler.handleJobInit(job, task);

      expect(taskBuilderMock.buildTasks).toHaveBeenCalledWith(taskBuildParams);
      expect(taskBuilderMock.pushTasks).toHaveBeenCalledWith(job.id, job.type, mergeTasks);
      expect(completeInitTaskSpy).toHaveBeenCalledWith(job, task, expect.any(Object));
    });

    it('should handle job init failure and reject the task', async () => {
      const { swapJobHandler, taskBuilderMock, queueClientMock } = setupSwapJobHandlerTest();

      const job = structuredClone(ingestionSwapUpdateJob);
      const task = initTaskForIngestionSwapUpdate;
      const tasks: AsyncGenerator<MergeTaskParameters, void, void> = (async function* () {})();

      const error = new Error('Test error');

      taskBuilderMock.buildTasks.mockReturnValue(tasks);
      taskBuilderMock.pushTasks.mockRejectedValue(error);
      queueClientMock.reject.mockResolvedValue(undefined);

      await swapJobHandler.handleJobInit(job, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, error.message);
    });
  });

  describe('handleJobFinalize', () => {
    it('should handle job finalize successfully', async () => {
      const { swapJobHandler, queueClientMock, jobManagerClientMock, mapproxyClientMock, catalogClientMock, seedingJobCreatorMock } =
        setupSwapJobHandlerTest();
      const job = structuredClone(ingestionSwapUpdateFinalizeJob);

      const task = { ...finalizeTaskForIngestionSwapUpdate };

      const { displayPath, tileOutputFormat } = job.parameters.additionalParams;
      const productType = job.productType as RasterProductTypes;
      const layerName: LayerName = `${job.resourceId}-${productType}`;
      const layerRelativePath = `${job.internalId}/${displayPath}`;
      const createSeedingJobParams: SeedJobParams = {
        mode: SeedMode.CLEAN,
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
      const job = structuredClone(ingestionSwapUpdateFinalizeJob);
      const task = { ...finalizeTaskForIngestionSwapUpdate };

      const error = new Error('Test error');

      queueClientMock.reject.mockResolvedValue(undefined);

      catalogClientMock.update.mockRejectedValue(error);

      await swapJobHandler.handleJobFinalize(job, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, error.message);
    });
  });
});
