import { IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import { registerDefaultConfig } from '../mocks/configMock';
import { ingestionNewJob, ingestionUpdateJob } from '../mocks/jobsMockData';
import {
  finalizeTaskForIngestionNew,
  finalizeTaskForIngestionSwapUpdate,
  finalizeTaskForIngestionUpdate,
  initTaskForIngestionNew,
  initTaskForIngestionUpdate,
} from '../mocks/tasksMockData';
import { IJobHandler, IngestionConfig } from '../../../src/common/interfaces';
import { JobProcessorTestContext, setupJobProcessorTest } from './jobProcessorSetup';

jest.mock('timers/promises', () => ({
  setTimeout: jest.fn().mockResolvedValue(undefined),
}));

describe('JobProcessor', () => {
  let testContext: JobProcessorTestContext;

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    registerDefaultConfig();
    testContext = setupJobProcessorTest();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('start', () => {
    it('should start polling and stop when stop is called', async () => {
      const { jobProcessor, mockDequeue, configMock } = testContext;
      const ingestionConfig = configMock.get<IngestionConfig>('jobManagement.ingestion');
      const dequeueIntervalMs = configMock.get<number>('jobManagement.config.dequeueIntervalMs');
      const { jobs, pollingTasks } = ingestionConfig;
      const jobTypesAmount = Object.keys(jobs).length;
      const pollingTasksTypesAmount = Object.keys(pollingTasks).length;
      const totalDequeueCalls = jobTypesAmount * pollingTasksTypesAmount;

      const processPromise = jobProcessor.start();
      jest.advanceTimersByTime(dequeueIntervalMs);
      jobProcessor.stop();
      await processPromise;

      expect(mockDequeue).toHaveBeenCalledTimes(totalDequeueCalls);
    });
  });

  describe('consumeAndProcess', () => {
    const initTestCases = [
      {
        jobType: ingestionNewJob.type,
        taskType: initTaskForIngestionNew.type,
        job: ingestionNewJob,
        task: initTaskForIngestionNew,
      },
      {
        jobType: ingestionUpdateJob.type,
        taskType: initTaskForIngestionNew.type,
        job: ingestionUpdateJob,
        task: initTaskForIngestionUpdate,
      },
      {
        jobType: ingestionUpdateJob.type,
        taskType: initTaskForIngestionNew.type,
        job: ingestionUpdateJob,
        task: initTaskForIngestionUpdate,
      },
    ];
    const finalizeTestCases = [
      {
        jobType: ingestionNewJob.type,
        taskType: finalizeTaskForIngestionNew.type,
        job: ingestionNewJob,
        task: finalizeTaskForIngestionNew,
      },
      {
        jobType: ingestionUpdateJob.type,
        taskType: finalizeTaskForIngestionUpdate.type,
        job: ingestionUpdateJob,
        task: finalizeTaskForIngestionUpdate,
      },
      {
        jobType: ingestionUpdateJob.type,
        taskType: finalizeTaskForIngestionSwapUpdate.type,
        job: ingestionUpdateJob,
        task: finalizeTaskForIngestionSwapUpdate,
      },
    ];

    test.each(initTestCases)('should process job of type $jobType and init task successfully', async ({ job, task }) => {
      const { jobProcessor, mockDequeue, mockGetJob, mockJobHandlerFactory, configMock } = testContext;
      const dequeueIntervalMs = configMock.get<number>('jobManagement.config.dequeueIntervalMs');

      const mockHandler: jest.Mocked<IJobHandler> = {
        handleJobInit: jest.fn().mockResolvedValue(undefined),
        handleJobFinalize: jest.fn().mockResolvedValue(undefined),
      };
      mockDequeue.mockResolvedValueOnce(task as ITaskResponse<unknown>);
      mockGetJob.mockResolvedValueOnce(job as unknown as IJobResponse<unknown, unknown>);
      mockJobHandlerFactory.mockReturnValueOnce(mockHandler);

      const processPromise = jobProcessor.start();
      jest.advanceTimersByTime(dequeueIntervalMs);
      jobProcessor.stop();
      await processPromise;

      expect(mockGetJob).toHaveBeenCalledTimes(1);
      expect(mockGetJob).toHaveBeenCalledWith(task.jobId);
      expect(mockJobHandlerFactory).toHaveBeenCalledWith(job.type);
      expect(mockHandler.handleJobInit).toHaveBeenCalledWith(job);
    });

    test.each(finalizeTestCases)('should process job of type $jobType and finalize task successfully', async ({ job, task }) => {
      const { jobProcessor, mockDequeue, mockGetJob, mockJobHandlerFactory, configMock } = testContext;
      const dequeueIntervalMs = configMock.get<number>('jobManagement.config.dequeueIntervalMs');

      const mockHandler: jest.Mocked<IJobHandler> = {
        handleJobInit: jest.fn().mockResolvedValue(undefined),
        handleJobFinalize: jest.fn().mockResolvedValue(undefined),
      };
      mockDequeue.mockResolvedValueOnce(task as ITaskResponse<unknown>);
      mockGetJob.mockResolvedValueOnce(job as unknown as IJobResponse<unknown, unknown>);
      mockJobHandlerFactory.mockReturnValueOnce(mockHandler);

      const processPromise = jobProcessor.start();
      jest.advanceTimersByTime(dequeueIntervalMs);
      jobProcessor.stop();
      await processPromise;

      expect(mockGetJob).toHaveBeenCalledTimes(1);
      expect(mockGetJob).toHaveBeenCalledWith(task.jobId);
      expect(mockJobHandlerFactory).toHaveBeenCalledWith(job.type);
      expect(mockHandler.handleJobFinalize).toHaveBeenCalledWith(job);
    });
  });
});
