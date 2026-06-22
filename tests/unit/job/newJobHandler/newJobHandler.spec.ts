/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
import type { Mocked } from 'vitest';
import type { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { finalizeTaskForIngestionNew, createTasksTaskForIngestionNew } from '../../mocks/tasksMockData';
import { ingestionNewJob, ingestionNewJobExtended } from '../../mocks/jobsMockData';
import type { MergeTask } from '../../../../src/common/interfaces';
import type { IngestionNewFinalizeJob } from '../../../../src/utils/zod/schemas/job.schema';
import { registerDefaultConfig } from '../../mocks/configMock';
import { PublishLayerError } from '../../../../src/common/errors';
import type { NewJobHandler } from '../../../../src/job/models/ingestion/newJobHandler';
import type { TileMergeTaskManager } from '../../../../src/task/models/tileMergeTaskManager';
import type { MapproxyApiClient } from '../../../../src/httpClients/mapproxyClient';
import type { GeoserverClient } from '../../../../src/httpClients/geoserverClient';
import type { CatalogClient } from '../../../../src/httpClients/catalogClient';
import type { JobTrackerClient } from '../../../../src/httpClients/jobTrackerClient';
import { setupNewJobHandlerTest } from './newJobHandlerSetup';

describe('NewJobHandler', () => {
  const tasks: AsyncGenerator<MergeTask, void, void> = (async function* () {})();

  let newJobHandler: NewJobHandler;
  let taskBuilderMock: Mocked<TileMergeTaskManager>;
  let queueClientMock: Mocked<QueueClient>;
  let jobManagerClientMock: Mocked<JobManagerClient>;
  let mapproxyClientMock: Mocked<MapproxyApiClient>;
  let geoserverClientMock: Mocked<GeoserverClient>;
  let catalogClientMock: Mocked<CatalogClient>;
  let jobTrackerClientMock: Mocked<JobTrackerClient>;

  beforeEach(async () => {
    vi.resetAllMocks();
    registerDefaultConfig();
    ({
      newJobHandler,
      taskBuilderMock,
      queueClientMock,
      jobManagerClientMock,
      mapproxyClientMock,
      geoserverClientMock,
      catalogClientMock,
      jobTrackerClientMock,
    } = await setupNewJobHandlerTest());
  });

  describe('handleJobInit', () => {
    it('should handle job init successfully', async () => {
      const job = ingestionNewJob;
      const task = createTasksTaskForIngestionNew;

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
      const job = ingestionNewJob;
      const task = createTasksTaskForIngestionNew;

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
      const job = { ...ingestionNewJobExtended, productType: undefined };
      const task = finalizeTaskForIngestionNew;

      jobManagerClientMock.updateJob.mockResolvedValue(undefined);
      jobManagerClientMock.updateTask.mockResolvedValue(undefined);
      queueClientMock.reject.mockResolvedValue(undefined);

      await newJobHandler.handleJobFinalize(job as IngestionNewFinalizeJob, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, false, expect.any(String));
      expect(jobTrackerClientMock.notify).toHaveBeenCalledWith(task);
    });

    it('should handle job finalize failure and reject the task (mapproxyApi publish failed)', async () => {
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
