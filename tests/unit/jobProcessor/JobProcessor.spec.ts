import nock from 'nock';
import { IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import { registerDefaultConfig } from '../mocks/configMock';
import { IJobHandler, IngestionConfig } from '../../../src/common/interfaces';
import { finalizeTestCases, initTestCases } from '../mocks/testCasesData';
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
  });

  afterEach(() => {
    jest.clearAllTimers();
    nock.cleanAll();
  });

  describe('start', () => {
    it('should start polling and stop when stop is called', async () => {
      testContext = setupJobProcessorTest({ useMockQueueClient: true });

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

  describe('jobByTaskTypePolling', () => {
    test.each(initTestCases)('should process job of type $jobType and init task successfully', async ({ job, task }) => {
      testContext = setupJobProcessorTest({ useMockQueueClient: true });
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
      testContext = setupJobProcessorTest({ useMockQueueClient: true });
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

  describe('getJobWithTaskType', () => {
    test.each([...initTestCases, ...finalizeTestCases])(
      'dequeue $taskType task and get $jobType job with corresponding taskType',
      async ({ jobType, taskType, job, task }) => {
        jest.useRealTimers();

        testContext = setupJobProcessorTest({ useMockQueueClient: false });

        const { jobProcessor, configMock, queueClient } = testContext;
        const jobManagerBaseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
        const heartbeatBaseUrl = configMock.get<string>('jobManagement.config.heartbeat.baseUrl');
        const consumeTaskUrl = `/tasks/${jobType}/${taskType}/startPending`;
        const misMatchRegex = /^\/tasks\/[^/]+\/[^/]+\/startPending$/;

        nock.emitter.on('no match', () => {
          nock(jobManagerBaseUrl).post(misMatchRegex).reply(404, undefined).persist();
        });

        nock(jobManagerBaseUrl)
          .post(consumeTaskUrl)
          .reply(200, { ...task })
          .persist()
          .get(`/jobs/${task.jobId}?shouldReturnTasks=false`)
          .reply(200, { ...job })
          .persist();

        nock(heartbeatBaseUrl).post(`/heartbeat/${task.id}`).reply(200, 'ok').persist();

        const dequeueSpy = jest.spyOn(queueClient, 'dequeue');
        const getJobSpy = jest.spyOn(queueClient.jobManagerClient, 'getJob');

        const jobAndTaskType = await jobProcessor['getJobWithTaskType']();

        expect(dequeueSpy).toHaveBeenCalledWith(jobType, taskType);
        expect(getJobSpy).toHaveBeenCalledWith(task.jobId);
        expect(jobAndTaskType?.taskType).toEqual(taskType);
        expect(jobAndTaskType?.job).toEqual(job);

        await queueClient.heartbeatClient.stop(task.id);
      }
    );
  });
});
