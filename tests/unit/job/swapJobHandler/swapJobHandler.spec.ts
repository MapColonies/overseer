/* eslint-disable @typescript-eslint/unbound-method */
import { getEntityName, getMapServingLayerName, type LayerName, swapUpdateAdditionalParamsSchema } from '@map-colonies/raster-shared';
import { registerDefaultConfig } from '../../mocks/configMock';
import { createFakePolygonalGeometry } from '../../mocks/geometryMockData';
import { Grid, type MergeTask, type SeedJobParams } from '../../../../src/common/interfaces';
import { finalizeTaskForIngestionSwapUpdate, createTasksTaskForIngestionSwapUpdate } from '../../mocks/tasksMockData';
import { ingestionSwapUpdateFinalizeJob, ingestionSwapUpdateJob } from '../../mocks/jobsMockData';
import { jobTrackerClientMock } from '../../mocks/jobManagerMocks';
import { setupSwapJobHandlerTest } from './swapJobHandlerSetup';

describe('swapJobHandler', () => {
  const mergeTasks: AsyncGenerator<MergeTask, void, void> = (async function* () {})();

  beforeEach(() => {
    vi.resetAllMocks();
    registerDefaultConfig();
  });

  describe('handleJobInit', () => {
    it('should handle job init successfully', async () => {
      const { swapJobHandler, queueClientMock, taskBuilderMock, readProductGeometryMock } = await setupSwapJobHandlerTest();
      const job = structuredClone(ingestionSwapUpdateJob);
      const task = createTasksTaskForIngestionSwapUpdate;
      const productGeometry = createFakePolygonalGeometry();

      const additionalParams = swapUpdateAdditionalParamsSchema.parse(job.parameters.additionalParams);

      readProductGeometryMock.mockResolvedValue(productGeometry);
      taskBuilderMock.buildTasks.mockReturnValue(mergeTasks);
      taskBuilderMock.pushTasks.mockResolvedValue(undefined);
      queueClientMock.ack.mockResolvedValue(undefined);

      const completeInitTaskSpy = vi.spyOn(swapJobHandler as unknown as { completeTask: (...args: unknown[]) => unknown }, 'completeTask');

      await swapJobHandler.handleJobInit(job, task);

      /* eslint-disable @typescript-eslint/no-unsafe-assignment */
      expect(taskBuilderMock.buildTasks).toHaveBeenCalledWith(
        expect.objectContaining({
          inputFiles: job.parameters.inputFiles,
          taskMetadata: expect.objectContaining({
            layerRelativePath: expect.stringMatching(new RegExp(`^${job.internalId}/[0-9a-f-]+$`)),
            tileOutputFormat: additionalParams.tileOutputFormat,
            isNewTarget: true,
            grid: Grid.TWO_ON_ONE,
          }),
          productGeometry,
          ingestionResolution: job.parameters.ingestionResolution,
        }),
        task
      );
      /* eslint-enable @typescript-eslint/no-unsafe-assignment */
      expect(taskBuilderMock.pushTasks).toHaveBeenCalledWith(task, job.id, job.type, mergeTasks);
      expect(completeInitTaskSpy).toHaveBeenCalledWith(job, task, expect.any(Object));
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
    });

    it('should handle job init failure and reject the task', async () => {
      const { swapJobHandler, taskBuilderMock, queueClientMock } = await setupSwapJobHandlerTest();

      const job = structuredClone(ingestionSwapUpdateJob);
      const task = createTasksTaskForIngestionSwapUpdate;

      const error = new Error('Test error');

      taskBuilderMock.buildTasks.mockReturnValue(mergeTasks);
      taskBuilderMock.pushTasks.mockRejectedValue(error);
      queueClientMock.reject.mockResolvedValue(undefined);

      await swapJobHandler.handleJobInit(job, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, error.message);
    });
  });

  describe('handleJobFinalize', () => {
    it('should handle job finalize successfully', async () => {
      const {
        swapJobHandler,
        queueClientMock,
        jobManagerClientMock,
        mapproxyClientMock,
        catalogClientMock,
        seedingJobCreatorMock,
        polygonPartsManagerClientMock,
      } = await setupSwapJobHandlerTest();
      const job = structuredClone(ingestionSwapUpdateFinalizeJob);

      const task = { ...finalizeTaskForIngestionSwapUpdate };

      const { displayPath, tileOutputFormat } = job.parameters.additionalParams;
      const productType = job.productType;
      const layerName: LayerName = getMapServingLayerName(job.resourceId, productType);
      const entityName = getEntityName(job.resourceId, productType);
      const layerRelativePath = `${job.internalId}/${displayPath}`;
      const createSeedingJobParams: SeedJobParams = {
        ingestionJob: job,
        layerName,
      };

      polygonPartsManagerClientMock.process.mockResolvedValue(undefined);
      jobManagerClientMock.updateJob.mockResolvedValue(undefined);
      jobManagerClientMock.updateTask.mockResolvedValue(undefined);
      mapproxyClientMock.update.mockResolvedValue(undefined);
      catalogClientMock.update.mockResolvedValue(undefined);

      await swapJobHandler.handleJobFinalize(job, task);

      expect(mapproxyClientMock.update).toHaveBeenCalledWith(layerName, layerRelativePath, tileOutputFormat);
      expect(jobManagerClientMock.updateTask).toHaveBeenCalledWith(job.id, task.id, {
        parameters: { processedParts: true, updatedInCatalog: false, updatedInMapproxy: false },
      });
      expect(jobManagerClientMock.updateTask).toHaveBeenCalledWith(job.id, task.id, {
        parameters: { processedParts: true, updatedInMapproxy: true, updatedInCatalog: false },
      });
      expect(catalogClientMock.update).toHaveBeenCalledWith(job, entityName);
      expect(jobManagerClientMock.updateTask).toHaveBeenCalledWith(job.id, task.id, {
        parameters: { processedParts: true, updatedInMapproxy: true, updatedInCatalog: true },
      });
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
      expect(jobTrackerClientMock.notify).toHaveBeenCalledWith(task);
      expect(seedingJobCreatorMock.create).toHaveBeenCalledWith(createSeedingJobParams);
    });

    it('should handle job finalize failure and reject the task', async () => {
      const { swapJobHandler, queueClientMock, catalogClientMock } = await setupSwapJobHandlerTest();
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
