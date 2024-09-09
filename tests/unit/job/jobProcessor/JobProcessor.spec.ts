import nock from 'nock';
import { IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import { registerDefaultConfig, setValue } from '../../mocks/configMock';
import { IJobHandler, IngestionConfig } from '../../../../src/common/interfaces';
import { finalizeTestCases, initTestCases } from '../../mocks/testCasesData';
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

  describe('consumeAndProcess', () => {
    test.each(initTestCases)('should process job of type $jobType and init task successfully', async ({ job, task }) => {
      testContext = setupJobProcessorTest({ useMockQueueClient: true });
      const { jobProcessor, mockDequeue, mockUpdateJob, mockGetJob, mockJobHandlerFactory, configMock } = testContext;
      const dequeueIntervalMs = configMock.get<number>('jobManagement.config.dequeueIntervalMs');

      const mockHandler: jest.Mocked<IJobHandler> = {
        handleJobInit: jest.fn().mockResolvedValue(undefined),
        handleJobFinalize: jest.fn().mockResolvedValue(undefined),
      };

      mockDequeue.mockResolvedValueOnce(task as ITaskResponse<unknown>);
      mockUpdateJob.mockResolvedValueOnce(undefined);
      mockGetJob.mockResolvedValueOnce(job as unknown as IJobResponse<unknown, unknown>);
      mockJobHandlerFactory.mockReturnValueOnce(mockHandler);

      const processPromise = jobProcessor.start();
      jest.advanceTimersByTime(dequeueIntervalMs);
      jobProcessor.stop();
      await processPromise;

      expect(mockGetJob).toHaveBeenCalledTimes(1);
      expect(mockGetJob).toHaveBeenCalledWith(task.jobId);
      expect(mockJobHandlerFactory).toHaveBeenCalledWith(job.type);
      expect(mockHandler.handleJobInit).toHaveBeenCalledWith(job, task.id);
    });

    test.each(finalizeTestCases)('should process job of type $jobType and finalize task successfully', async ({ job, task }) => {
      testContext = setupJobProcessorTest({ useMockQueueClient: true });
      const { jobProcessor, mockDequeue, mockGetJob, mockJobHandlerFactory, configMock, mockUpdateJob } = testContext;
      const dequeueIntervalMs = configMock.get<number>('jobManagement.config.dequeueIntervalMs');

      const mockHandler: jest.Mocked<IJobHandler> = {
        handleJobInit: jest.fn().mockResolvedValue(undefined),
        handleJobFinalize: jest.fn().mockResolvedValue(undefined),
      };
      mockDequeue.mockResolvedValueOnce(task as ITaskResponse<unknown>);
      mockUpdateJob.mockResolvedValueOnce(undefined);
      mockGetJob.mockResolvedValueOnce(job as unknown as IJobResponse<unknown, unknown>);
      mockJobHandlerFactory.mockReturnValueOnce(mockHandler);

      const processPromise = jobProcessor.start();
      jest.advanceTimersByTime(dequeueIntervalMs);
      jobProcessor.stop();
      await processPromise;

      expect(mockGetJob).toHaveBeenCalledTimes(1);
      expect(mockGetJob).toHaveBeenCalledWith(task.jobId);
      expect(mockJobHandlerFactory).toHaveBeenCalledWith(job.type);
      expect(mockHandler.handleJobFinalize).toHaveBeenCalledWith(job, task.id);
    });

    it('should reject task if an error occurred during processing', async () => {
      testContext = setupJobProcessorTest({ useMockQueueClient: true });
      const { jobProcessor, mockDequeue, mockUpdateJob, mockGetJob, queueClient, mockJobHandlerFactory } = testContext;
      const error = new Error('test error');
      const job = initTestCases[0].job;
      const task = initTestCases[0].task;

      mockDequeue.mockResolvedValueOnce(task as ITaskResponse<unknown>);
      mockUpdateJob.mockResolvedValue(undefined);
      mockGetJob.mockResolvedValueOnce(job as unknown as IJobResponse<unknown, unknown>);
      queueClient.reject = jest.fn().mockResolvedValue(undefined);
      const rejectSpy = jest.spyOn(queueClient, 'reject');

      mockJobHandlerFactory.mockImplementationOnce(() => {
        throw error;
      });

      await jobProcessor['consumeAndProcess']();

      expect(mockDequeue).toHaveBeenCalledTimes(1);
      expect(mockUpdateJob).toHaveBeenCalledTimes(1);
      expect(mockGetJob).toHaveBeenCalledTimes(1);
      expect(rejectSpy).toHaveBeenCalledWith(job.id, task.id, true, error.message);
    });
  });

  describe('getJobAndTaskResponse', () => {
    test.each([...initTestCases, ...finalizeTestCases])(
      'dequeue $taskType task and get $jobType job with corresponding taskType',
      async ({ jobType, taskType, job, task }) => {
        jest.useRealTimers();

        testContext = setupJobProcessorTest({ useMockQueueClient: false });

        const { jobProcessor, configMock, queueClient } = testContext;
        const jobManagerBaseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
        const heartbeatBaseUrl = configMock.get<string>('jobManagement.config.heartbeat.baseUrl');
        const consumeTaskUrl = `/tasks/${jobType}/${taskType}/startPending`;
        const updateJobUrl = `/jobs/${task.jobId}`;
        const misMatchRegex = /^\/tasks\/[^/]+\/[^/]+\/startPending$/;

        nock.emitter.on('no match', () => {
          nock(jobManagerBaseUrl).post(misMatchRegex).reply(404, undefined).persist();
        });

        nock(jobManagerBaseUrl)
          .post(consumeTaskUrl)
          .reply(200, { ...task })
          .persist()
          .put(updateJobUrl)
          .reply(200)
          .persist()
          .get(`/jobs/${task.jobId}?shouldReturnTasks=false`)
          .reply(200, { ...job })
          .persist();

        nock(heartbeatBaseUrl).post(`/heartbeat/${task.id}`).reply(200, 'ok').persist();

        const dequeueSpy = jest.spyOn(queueClient, 'dequeue');
        const getJobSpy = jest.spyOn(queueClient.jobManagerClient, 'getJob');

        const jobAndTask = await jobProcessor['getJobAndTaskResponse']();

        expect(dequeueSpy).toHaveBeenCalledWith(jobType, taskType);
        expect(getJobSpy).toHaveBeenCalledWith(task.jobId);
        expect(jobAndTask?.task.type).toEqual(taskType);
        expect(jobAndTask?.job).toEqual(job);

        await queueClient.heartbeatClient.stop(task.id);
      }
    );

    it('should continue to the next iteration if task reached max attempts', async () => {
      jest.useRealTimers();

      testContext = setupJobProcessorTest({ useMockQueueClient: false });
      setValue('jobManagement.ingestion.maxTaskAttempts', 3);

      const { jobProcessor, configMock, queueClient } = testContext;
      const jobManagerBaseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
      const heartbeatBaseUrl = configMock.get<string>('jobManagement.config.heartbeat.baseUrl');
      const job = initTestCases[0].job;
      const task = initTestCases[0].task;
      const jobType = job.type;
      const taskType = task.type;

      // nock setup
      const consumeTaskUrl = `/tasks/${jobType}/${taskType}/startPending`;
      const updateTaskUrl = `/jobs/${job.id}/tasks/${task.id}`;
      const updateJobUrl = `/jobs/${job.id}`;
      const misMatchRegex = /^\/tasks\/[^/]+\/[^/]+\/startPending$/;
      const dequeuedTask = { ...task, attempts: 3 };

      nock.emitter.on('no match', () => {
        nock(jobManagerBaseUrl).post(misMatchRegex).reply(404, undefined).persist();
      });

      nock(jobManagerBaseUrl)
        .post(consumeTaskUrl)
        .reply(200, { ...dequeuedTask })
        .persist();

      // rejecting the task when it reaches max attempts
      nock(jobManagerBaseUrl).put(updateTaskUrl).reply(200).persist();

      nock(jobManagerBaseUrl).put(updateJobUrl).reply(200).persist();

      nock(heartbeatBaseUrl).post(`/heartbeat/${dequeuedTask.id}`).reply(200, 'ok').persist();

      const dequeueSpy = jest.spyOn(queueClient, 'dequeue');

      const jobAndTask = await jobProcessor['getJobAndTaskResponse']();

      expect(dequeueSpy).toHaveBeenCalledWith(jobType, taskType);
      expect(jobAndTask).toBeUndefined();

      await queueClient.heartbeatClient.stop(dequeuedTask.id);
    });

    it('should throw an error if an error occurred during dequeue task and get job', async () => {
      jest.useRealTimers();

      testContext = setupJobProcessorTest({ useMockQueueClient: false });

      const { jobProcessor, configMock, queueClient } = testContext;
      const jobManagerBaseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
      const jobType = initTestCases[0].jobType;
      const taskType = initTestCases[0].taskType;
      const consumeTaskUrl = `/tasks/${jobType}/${taskType}/startPending`;
      const misMatchRegex = /^\/tasks\/[^/]+\/[^/]+\/startPending$/;

      nock.emitter.on('no match', () => {
        nock(jobManagerBaseUrl).post(misMatchRegex).reply(404, undefined).persist();
      });

      nock(jobManagerBaseUrl).post(consumeTaskUrl).reply(500, 'Request failed with status code 500').persist();

      const dequeueSpy = jest.spyOn(queueClient, 'dequeue');

      await expect(jobProcessor['getJobAndTaskResponse']()).rejects.toThrow('Request failed with status code 500');
      expect(dequeueSpy).toHaveBeenCalledWith(jobType, taskType);
    });
  });
});
