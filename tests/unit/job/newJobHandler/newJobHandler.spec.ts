/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
import { finalizeTaskForIngestionNew, initTaskForIngestionNew } from '../../mocks/tasksMockData';
import { ingestionNewJob, ingestionNewJobExtended } from '../../mocks/jobsMockData';
import { MergeTask } from '../../../../src/common/interfaces';
import { registerDefaultConfig } from '../../mocks/configMock';
import { PublishLayerError } from '../../../../src/common/errors';
import { setupNewJobHandlerTest } from './newJobHandlerSetup';

describe('NewJobHandler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    registerDefaultConfig();
  });
  describe('handleJobInit', () => {
    it('should handle job init successfully', async () => {
      const { newJobHandler, taskBuilderMock, queueClientMock, jobManagerClientMock } = setupNewJobHandlerTest();
      const job = ingestionNewJob;
      const task = initTaskForIngestionNew;
      const tasks: AsyncGenerator<MergeTask, void, void> = (async function* () {})();
      taskBuilderMock.buildTasks.mockReturnValue(tasks);
      taskBuilderMock.pushTasks.mockResolvedValue(undefined);
      jobManagerClientMock.updateJob.mockResolvedValue(undefined);
      queueClientMock.ack.mockResolvedValue(undefined);

      await newJobHandler.handleJobInit(job, task);

      expect(taskBuilderMock.buildTasks).toHaveBeenCalled();
      expect(taskBuilderMock.pushTasks).toHaveBeenCalledWith(task, job.id, job.type, tasks);
      expect(queueClientMock.jobManagerClient.updateJob).toHaveBeenCalledWith(job.id, {
        internalId: expect.any(String),
        parameters: expect.any(Object),
      });
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
    });

    it('should handle job init failure and reject the task', async () => {
      const { newJobHandler, taskBuilderMock, queueClientMock } = setupNewJobHandlerTest();

      const job = ingestionNewJob;
      const task = initTaskForIngestionNew;
      const tasks: AsyncGenerator<MergeTask, void, void> = (async function* () {})();

      const error = new Error('Test error');

      taskBuilderMock.buildTasks.mockReturnValue(tasks);
      taskBuilderMock.pushTasks.mockRejectedValue(error);
      queueClientMock.reject.mockResolvedValue(undefined);

      await newJobHandler.handleJobInit(job, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, error.message);
    });
  });

  describe('handleJobFinalize', () => {
    it('should handle job finalize successfully', async () => {
      const {
        newJobHandler,
        queueClientMock,
        jobManagerClientMock,
        mapproxyClientMock,
        geoserverClientMock,
        catalogClientMock,
        jobTrackerClientMock,
      } = setupNewJobHandlerTest();
      const job = ingestionNewJobExtended;
      const task = finalizeTaskForIngestionNew;

      jobManagerClientMock.updateJob.mockResolvedValue(undefined);
      jobManagerClientMock.updateTask.mockResolvedValue(undefined);
      mapproxyClientMock.publish.mockResolvedValue(undefined);
      geoserverClientMock.publish.mockResolvedValue(undefined);
      catalogClientMock.publish.mockResolvedValue(undefined);
      queueClientMock.ack.mockResolvedValue(undefined);

      await newJobHandler.handleJobFinalize(job, task);

      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
      expect(jobTrackerClientMock.notify).toHaveBeenCalledWith(task);
    });

    it('should handle job finalize failure, reject the task and fail the job (zod validation error)', async () => {
      const { newJobHandler, queueClientMock, jobManagerClientMock, jobTrackerClientMock } = setupNewJobHandlerTest();
      const job = { ...ingestionNewJobExtended };
      const task = finalizeTaskForIngestionNew;

      delete job.productType;

      jobManagerClientMock.updateJob.mockResolvedValue(undefined);
      jobManagerClientMock.updateTask.mockResolvedValue(undefined);
      queueClientMock.reject.mockResolvedValue(undefined);

      await newJobHandler.handleJobFinalize(job, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, false, expect.any(String));
      expect(jobTrackerClientMock.notify).toHaveBeenCalledWith(task);
    });

    it('should handle job finalize failure and reject the task (mapproxyApi publish failed)', async () => {
      const { newJobHandler, queueClientMock, jobManagerClientMock, mapproxyClientMock } = setupNewJobHandlerTest();
      const job = ingestionNewJobExtended;
      const task = finalizeTaskForIngestionNew;

      const error = new PublishLayerError('MapproxyApi', 'testLayer', new Error('Test error'));

      jobManagerClientMock.updateJob.mockResolvedValue(undefined);
      jobManagerClientMock.updateTask.mockResolvedValue(undefined);
      mapproxyClientMock.publish.mockRejectedValue(error);
      queueClientMock.reject.mockResolvedValue(undefined);

      await newJobHandler.handleJobFinalize(job, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, error.message);
    });

    it('should handle job finalize failure and reject the task (geoserverApi publish failed)', async () => {
      const { newJobHandler, queueClientMock, jobManagerClientMock, mapproxyClientMock, geoserverClientMock } = setupNewJobHandlerTest();
      const job = ingestionNewJobExtended;
      const task = finalizeTaskForIngestionNew;

      const error = new PublishLayerError('GeoserverApi', 'testLayer', new Error('Test error'));

      jobManagerClientMock.updateJob.mockResolvedValue(undefined);
      jobManagerClientMock.updateTask.mockResolvedValue(undefined);
      mapproxyClientMock.publish.mockResolvedValue(undefined);
      geoserverClientMock.publish.mockRejectedValue(error);
      queueClientMock.reject.mockResolvedValue(undefined);

      await newJobHandler.handleJobFinalize(job, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, error.message);
    });

    it('should handle job finalize failure and reject the task (catalogApi publish failed)', async () => {
      const { newJobHandler, queueClientMock, jobManagerClientMock, mapproxyClientMock, geoserverClientMock, catalogClientMock } =
        setupNewJobHandlerTest();
      const job = ingestionNewJobExtended;
      const task = finalizeTaskForIngestionNew;

      const error = new PublishLayerError('CatalogApi', 'testLayer', new Error('Test error'));

      jobManagerClientMock.updateJob.mockResolvedValue(undefined);
      jobManagerClientMock.updateTask.mockResolvedValue(undefined);
      mapproxyClientMock.publish.mockResolvedValue(undefined);
      geoserverClientMock.publish.mockResolvedValue(undefined);
      catalogClientMock.publish.mockRejectedValue(error);
      queueClientMock.reject.mockResolvedValue(undefined);

      await newJobHandler.handleJobFinalize(job, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, error.message);
    });
  });
});
