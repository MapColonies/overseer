/* eslint-disable @typescript-eslint/unbound-method */
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { updateAdditionalParamsSchema } from '@map-colonies/raster-shared';
import { Grid, MergeTaskParameters } from '../../../../src/common/interfaces';
import type { CatalogClient } from '../../../../src/httpClients/catalogClient';
import type { JobTrackerClient } from '../../../../src/httpClients/jobTrackerClient';
import type { UpdateJobHandler } from '../../../../src/job/models/ingestion/updateJobHandler';
import type { TileMergeTaskManager } from '../../../../src/task/models/tileMergeTaskManager';
import { registerDefaultConfig } from '../../mocks/configMock';
import { ingestionNewJobExtended, ingestionUpdateFinalizeJob, ingestionUpdateJob } from '../../mocks/jobsMockData';
import { finalizeTaskForIngestionUpdate, initTaskForIngestionUpdate } from '../../mocks/tasksMockData';
import { setupUpdateJobHandlerTest } from './updateJobHandlerSetup';

describe('updateJobHandler', () => {
  let updateJobHandler: UpdateJobHandler;
  let catalogClientMock: jest.Mocked<CatalogClient>;
  let jobTrackerClient: jest.Mocked<JobTrackerClient>;
  let taskBuilderMock: jest.Mocked<TileMergeTaskManager>;
  let queueClientMock: jest.MockedObjectDeep<QueueClient>;

  beforeAll(() => {
    const setupUpdateJobHandlerTestData = setupUpdateJobHandlerTest();
    catalogClientMock = setupUpdateJobHandlerTestData.catalogClientMock;
    queueClientMock = setupUpdateJobHandlerTestData.queueClientMock;
    taskBuilderMock = setupUpdateJobHandlerTestData.taskBuilderMock;
    updateJobHandler = setupUpdateJobHandlerTestData.updateJobHandler;
    jobTrackerClient = setupUpdateJobHandlerTestData.jobTrackerClientMock
  });

  beforeEach(() => {
    jest.resetAllMocks();
    registerDefaultConfig();
  });

  describe('handleJobInit', () => {
    // TODO: add test coverage
    // TODO: update existing tests with changes
    it('should handle job init successfully', async () => {
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
      const buildLowResolutionTasks: AsyncGenerator<MergeTaskParameters, void, void> = (async function* () {})();

      queueClientMock.jobManagerClient.getJobs.mockResolvedValueOnce([ingestionNewJobExtended]);
      taskBuilderMock.buildTasks.mockReturnValueOnce(mergeTasks);
      taskBuilderMock.pushTasks.mockResolvedValueOnce(undefined);
      taskBuilderMock.buildLowResolutionTasks.mockReturnValueOnce(buildLowResolutionTasks);
      taskBuilderMock.pushTasks.mockResolvedValueOnce(undefined);
      queueClientMock.ack.mockResolvedValueOnce(undefined);

      await updateJobHandler.handleJobInit(job, task);

      expect(queueClientMock.jobManagerClient.getJobs).toHaveBeenCalledWith({
        resourceId: job.resourceId,
        type: 'Ingestion_New',
      });
      expect(taskBuilderMock.buildTasks).toHaveBeenCalledWith(taskBuildParams);
      expect(taskBuilderMock.pushTasks).toHaveBeenCalledWith(job.id, job.type, mergeTasks);
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
      expect(jobTrackerClient.notify).toHaveBeenCalledWith(task);
    });

    it('should handle job init successfully with low resolution update', async () => {
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
      const buildLowResolutionTasks: AsyncGenerator<MergeTaskParameters, void, void> = (async function* () {})();

      queueClientMock.jobManagerClient.getJobs.mockResolvedValueOnce([ingestionNewJobExtended]);
      taskBuilderMock.buildTasks.mockReturnValue(mergeTasks);
      taskBuilderMock.pushTasks.mockResolvedValue(undefined);
      taskBuilderMock.buildLowResolutionTasks.mockReturnValue(buildLowResolutionTasks);
      queueClientMock.ack.mockResolvedValue(undefined);

      await updateJobHandler.handleJobInit(job, task);

      expect(queueClientMock.jobManagerClient.getJobs).toHaveBeenCalledWith({
        resourceId: job.resourceId,
        type: 'Ingestion_New',
      });
      expect(taskBuilderMock.buildTasks).toHaveBeenCalledWith(taskBuildParams);
      expect(taskBuilderMock.pushTasks).toHaveBeenCalledWith(job.id, job.type, mergeTasks);
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
    });

    it('should handle job init failure and reject the task', async () => {
      const job = structuredClone(ingestionUpdateJob);
      const task = initTaskForIngestionUpdate;
      const tasks: AsyncGenerator<MergeTaskParameters, void, void> = (async function* () {})();

      const error = new Error('Test error');

      queueClientMock.jobManagerClient.getJobs.mockResolvedValueOnce([ingestionNewJobExtended]);
      taskBuilderMock.buildTasks.mockReturnValue(tasks);
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

      catalogClientMock.update.mockResolvedValue(undefined);
      jobManagerClientMock.updateTask.mockResolvedValue(undefined);

      await updateJobHandler.handleJobFinalize(job, task);

      expect(catalogClientMock.update).toHaveBeenCalledWith(job);
      expect(jobManagerClientMock.updateTask).toHaveBeenCalledWith(job.id, task.id, { parameters: { updatedInCatalog: true } });
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
