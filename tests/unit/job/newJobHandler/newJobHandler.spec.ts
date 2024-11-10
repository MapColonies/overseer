/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
import { OperationStatus } from '@map-colonies/mc-priority-queue';
import { finalizeTaskForIngestionNew } from '../../mocks/tasksMockData';
import { ingestionNewJob, ingestionNewJobExtended } from '../../mocks/jobsMockData';
import { MergeTaskParameters } from '../../../../src/common/interfaces';
import { COMPLETED_PERCENTAGE, JOB_SUCCESS_MESSAGE } from '../../../../src/common/constants';
import { PublishLayerError } from '../../../../src/common/errors';
import { setupNewJobHandlerTest } from './newJobHandlerSetup';

describe('NewJobHandler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });
  describe('handleJobInit', () => {
    it('should handle job init successfully', async () => {
      const { newJobHandler, taskBuilderMock, queueClientMock, jobManagerClientMock } = setupNewJobHandlerTest();
      const job = ingestionNewJob;
      const taskId = '7e630dea-ea29-4b30-a88e-5407bf67d1bc';
      const tasks: AsyncGenerator<MergeTaskParameters, void, void> = (async function* () {})();
      taskBuilderMock.buildTasks.mockReturnValue(tasks);
      taskBuilderMock.pushTasks.mockResolvedValue(undefined);
      jobManagerClientMock.updateJob.mockResolvedValue(undefined);
      queueClientMock.ack.mockResolvedValue(undefined);

      await newJobHandler.handleJobInit(job, taskId);

      expect(taskBuilderMock.buildTasks).toHaveBeenCalled();
      expect(taskBuilderMock.pushTasks).toHaveBeenCalledWith(job.id, tasks);
      expect(queueClientMock.jobManagerClient.updateJob).toHaveBeenCalledWith(job.id, {
        internalId: expect.any(String),
        parameters: expect.any(Object),
      });
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, taskId);
    });

    it('should handle job init failure and reject the task', async () => {
      const { newJobHandler, taskBuilderMock, queueClientMock } = setupNewJobHandlerTest();

      const job = ingestionNewJob;
      const taskId = '7e630dea-ea29-4b30-a88e-5407bf67d1bc';
      const tasks: AsyncGenerator<MergeTaskParameters, void, void> = (async function* () {})();

      const error = new Error('Test error');

      taskBuilderMock.buildTasks.mockReturnValue(tasks);
      taskBuilderMock.pushTasks.mockRejectedValue(error);
      queueClientMock.reject.mockResolvedValue(undefined);

      await newJobHandler.handleJobInit(job, taskId);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, taskId, true, error.message);
    });
  });

  describe('handleJobFinalize', () => {
    it('should handle job finalize successfully', async () => {
      const { newJobHandler, queueClientMock, jobManagerClientMock, mapproxyClientMock, geoserverClientMock, catalogClientMock } =
        setupNewJobHandlerTest();
      const job = ingestionNewJobExtended;
      const task = finalizeTaskForIngestionNew;

      jobManagerClientMock.updateJob.mockResolvedValue(undefined);
      jobManagerClientMock.updateTask.mockResolvedValue(undefined);
      mapproxyClientMock.publish.mockResolvedValue(undefined);
      geoserverClientMock.publish.mockResolvedValue(undefined);
      catalogClientMock.publish.mockResolvedValue(undefined);
      queueClientMock.ack.mockResolvedValue(undefined);

      await newJobHandler.handleJobFinalize(job, task);

      expect(jobManagerClientMock.updateJob).toHaveBeenCalledWith(job.id, {
        status: OperationStatus.COMPLETED,
        percentage: COMPLETED_PERCENTAGE,
        reason: JOB_SUCCESS_MESSAGE,
      });

      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
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
