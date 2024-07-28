import { ITaskResponse } from '@map-colonies/mc-priority-queue';
import { registerDefaultConfig } from '../mocks/configMock';
import { ingestionNewJob, ingestionUpdateJob } from '../mocks/jobsMockData';
import { initTaskForIngestionNew, initTaskForIngestionUpdate } from '../mocks/tasksMockData';
import { NewJobHandler } from '../../../src/models/newJobHandler';
import { UpdateJobHandler } from '../../../src/models/updateJobHandler';
import { SwapJobHandler } from '../../../src/models/swapJobHandler';
import { IJobHandler, IngestionJobsConfig } from '../../../src/common/interfaces';
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
      const jobTypes = configMock.get<IngestionJobsConfig>('jobManagement.ingestion.jobs');
      const dequeueIntervalMs = configMock.get<number>('jobManagement.config.dequeueIntervalMs');
      const jobTypesArray = Object.keys(jobTypes);

      const processPromise = jobProcessor.start();
      jest.advanceTimersByTime(dequeueIntervalMs);
      jobProcessor.stop();
      await processPromise;

      expect(mockDequeue).toHaveBeenCalledTimes(jobTypesArray.length); // as number of job types
    });
  });

  describe('consumeAndProcess', () => {
    const testCases = [
      {
        jobType: 'Ingestion_New',
        job: ingestionNewJob,
        initTask: initTaskForIngestionNew,
        expectedHandlerType: NewJobHandler,
      },
      {
        jobType: 'Ingestion_Update',
        job: ingestionUpdateJob,
        initTask: initTaskForIngestionUpdate,
        expectedHandlerType: UpdateJobHandler,
      },
      {
        jobType: 'Ingestion_Swap_Update',
        job: ingestionUpdateJob,
        initTask: initTaskForIngestionUpdate,
        expectedHandlerType: SwapJobHandler,
      },
    ];

    test.each(testCases)('should process job of type $jobType successfully', async ({ job, initTask }) => {
      const { jobProcessor, mockDequeue, mockGetJob, mockJobHandlerFactory, configMock } = testContext;
      const dequeueIntervalMs = configMock.get<number>('jobManagement.config.dequeueIntervalMs');

      const mockHandler: jest.Mocked<IJobHandler> = {
        handleJob: jest.fn().mockResolvedValue(undefined),
      };
      mockDequeue.mockResolvedValueOnce(initTask as ITaskResponse<unknown>);
      mockGetJob.mockResolvedValueOnce(job);
      mockJobHandlerFactory.mockReturnValueOnce(mockHandler);

      const processPromise = jobProcessor.start();
      jest.advanceTimersByTime(dequeueIntervalMs);
      jobProcessor.stop();
      await processPromise;

      expect(mockGetJob).toHaveBeenCalledTimes(1);
      expect(mockGetJob).toHaveBeenCalledWith(initTask.jobId);
      expect(mockJobHandlerFactory).toHaveBeenCalledWith(job.type);
      expect(mockHandler.handleJob).toHaveBeenCalledWith(job);
    });
  });
});
