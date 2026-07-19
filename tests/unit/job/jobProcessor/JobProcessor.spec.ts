import type { Mocked } from 'vitest';
import nock, { cleanAll, emitter } from 'nock';
import { OperationStatus } from '@map-colonies/mc-priority-queue';
import type { IJobHandler, JobAndTaskResponse, PollingConfig, JobManagementConfig } from '../../../../src/common/interfaces';
import { getPollingJobs, parseInstanceType } from '../../../../src/utils/configUtil';
import type { InstanceType } from '../../../../src/utils/zod/schemas/instance.schema';
import { jobTaskSchemaMap, type OperationValidationKey } from '../../../../src/utils/zod/schemas/job.schema';
import { registerDefaultConfig, setValue } from '../../mocks/configMock';
import { createTasksTestCases, deleteTestCases, finalizeTestCases } from '../../mocks/testCasesData';
import type { JobProcessorTestContext } from './jobProcessorSetup';
import { setupJobProcessorTest } from './jobProcessorSetup';

vi.mock('timers/promises', () => ({
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));

describe('JobProcessor', () => {
  let testContext: JobProcessorTestContext;

  beforeAll(() => {
    vi.useFakeTimers();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    registerDefaultConfig();
    testContext = await setupJobProcessorTest({ useMockQueueClient: true });
  });

  afterEach(() => {
    vi.clearAllTimers();
    cleanAll();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  describe('start', () => {
    it('should start polling and stop when stop is called', async () => {
      const { jobProcessor, mockDequeue, configMock } = testContext;
      const pollingConfig = configMock.get<PollingConfig>('jobManagement.polling');
      const dequeueIntervalMs = configMock.get<number>('jobManagement.config.dequeueIntervalMs');
      const { tasks } = pollingConfig;
      const jobManagementConfig = configMock.get<JobManagementConfig>('jobManagement');
      const instanceType = parseInstanceType(configMock.get<InstanceType>('instanceType'));
      const jobs = getPollingJobs(jobManagementConfig, instanceType);
      const jobTypesAmount = Object.keys(jobs).length;
      const pollingTasksTypesAmount = Object.keys(tasks).length;
      const totalDequeueCalls = jobTypesAmount * pollingTasksTypesAmount;

      const processPromise = jobProcessor.start();
      vi.advanceTimersByTime(dequeueIntervalMs);
      jobProcessor.stop();
      await processPromise;

      expect(mockDequeue).toHaveBeenCalledTimes(totalDequeueCalls);
    });
  });

  describe('consumeAndProcess', () => {
    test.each(createTasksTestCases)('should process job of type $jobType and $taskType task successfully', async ({ job, task }) => {
      const { jobProcessor, mockDequeue, mockUpdateJob, mockGetJob, mockJobHandlerFactory, configMock } = testContext;
      const dequeueIntervalMs = configMock.get<number>('jobManagement.config.dequeueIntervalMs');

      const validationKey = `${job.type}_${task.type}` as OperationValidationKey;
      const { jobSchema, taskSchema } = jobTaskSchemaMap[validationKey];

      const jobSchemaSpy = vi.spyOn(jobSchema, 'parse');
      const taskSchemaSpy = vi.spyOn(taskSchema, 'parse');

      const mockHandler: Mocked<IJobHandler> = {
        handleJobInit: vi.fn().mockResolvedValue(undefined),
        handleJobFinalize: vi.fn().mockResolvedValue(undefined),
      };

      mockDequeue.mockResolvedValueOnce(task);
      mockUpdateJob.mockResolvedValueOnce(undefined);
      mockGetJob.mockResolvedValueOnce(job);
      mockJobHandlerFactory.mockReturnValueOnce(mockHandler);

      const processPromise = jobProcessor.start();
      vi.advanceTimersByTime(dequeueIntervalMs);
      jobProcessor.stop();
      await processPromise;

      expect(mockGetJob).toHaveBeenCalledTimes(1);
      expect(mockGetJob).toHaveBeenCalledWith(task.jobId);
      /* eslint-disable @typescript-eslint/no-unsafe-return */
      expect(() => jobSchema.parse(job)).not.toThrow();
      expect(() => taskSchema.parse(task)).not.toThrow();
      /* eslint-enable @typescript-eslint/no-unsafe-return */
      expect(jobSchemaSpy).toHaveBeenCalledWith(job);
      expect(taskSchemaSpy).toHaveBeenCalledWith(task);
      expect(mockJobHandlerFactory).toHaveBeenCalledWith(job.type);
      expect(mockHandler.handleJobInit).toHaveBeenCalledWith(job, task);
    });

    test.each(finalizeTestCases)('should process job of type $jobType and finalize task successfully', async ({ job, task }) => {
      const { jobProcessor, mockDequeue, mockGetJob, mockJobHandlerFactory, configMock, mockUpdateJob } = testContext;
      const dequeueIntervalMs = configMock.get<number>('jobManagement.config.dequeueIntervalMs');

      const validationKey = `${job.type}_${task.type}` as OperationValidationKey;
      const { jobSchema, taskSchema } = jobTaskSchemaMap[validationKey];

      const jobSchemaSpy = vi.spyOn(jobSchema, 'parse');
      const taskSchemaSpy = vi.spyOn(taskSchema, 'parse');

      const mockHandler: Mocked<IJobHandler> = {
        handleJobInit: vi.fn().mockResolvedValue(undefined),
        handleJobFinalize: vi.fn().mockResolvedValue(undefined),
      };
      mockDequeue.mockResolvedValueOnce(task);
      mockUpdateJob.mockResolvedValueOnce(undefined);
      mockGetJob.mockResolvedValueOnce(job);
      mockJobHandlerFactory.mockReturnValueOnce(mockHandler);

      const processPromise = jobProcessor.start();
      vi.advanceTimersByTime(dequeueIntervalMs);
      jobProcessor.stop();
      await processPromise;

      expect(mockGetJob).toHaveBeenCalledTimes(1);
      expect(mockGetJob).toHaveBeenCalledWith(task.jobId);
      /* eslint-disable @typescript-eslint/no-unsafe-return */
      expect(() => jobSchema.parse(job)).not.toThrow();
      expect(() => taskSchema.parse(task)).not.toThrow();
      /* eslint-enable @typescript-eslint/no-unsafe-return */
      expect(jobSchemaSpy).toHaveBeenCalledWith(job);
      expect(taskSchemaSpy).toHaveBeenCalledWith(task);
      expect(mockJobHandlerFactory).toHaveBeenCalledWith(job.type);
      expect(mockHandler.handleJobFinalize).toHaveBeenCalledWith(job, task);
    });

    it('should reject task if an error occurred during processing', async () => {
      const { jobProcessor, mockDequeue, mockUpdateJob, mockGetJob, queueClient, mockJobHandlerFactory } = testContext;
      const error = new Error('test error');
      const job = createTasksTestCases[0]!.job;
      const task = createTasksTestCases[0]!.task;

      mockDequeue.mockResolvedValueOnce(task);
      mockUpdateJob.mockResolvedValue(undefined);
      mockGetJob.mockResolvedValueOnce(job);
      queueClient.reject = vi.fn().mockResolvedValue(undefined);
      const rejectSpy = vi.spyOn(queueClient, 'reject');

      mockJobHandlerFactory.mockImplementationOnce(() => {
        throw error;
      });

      await jobProcessor['consumeAndProcess']();

      expect(mockDequeue).toHaveBeenCalledTimes(1);
      expect(mockGetJob).toHaveBeenCalledTimes(1);
      expect(rejectSpy).toHaveBeenCalledWith(job.id, task.id, true, error.message);
    });

    it('should notify jobTracker if task is unrecoverable', async () => {
      const { jobProcessor, mockDequeue, mockUpdateJob, mockGetJob, queueClient, jobTrackerClientMock } = testContext;
      const job = { ...createTasksTestCases[0]!.job, id: 'invalidJobId' };
      const task = { ...createTasksTestCases[0]!.task, id: 'invalidTaskId' };

      mockDequeue.mockResolvedValueOnce(task);
      mockUpdateJob.mockResolvedValue(undefined);
      mockGetJob.mockResolvedValueOnce(job);

      queueClient.reject = vi.fn().mockResolvedValue(undefined);

      const rejectSpy = vi.spyOn(queueClient, 'reject');

      await jobProcessor['consumeAndProcess']();

      expect(rejectSpy).toHaveBeenCalledWith(job.id, task.id, false, expect.any(String));
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(jobTrackerClientMock.notify).toHaveBeenCalledWith(task);
    });
  });

  describe('getJobAndTaskResponse', () => {
    beforeEach(() => {
      vi.useRealTimers();
    });

    afterEach(() => {
      vi.useFakeTimers();
    });

    test.each([...createTasksTestCases, ...finalizeTestCases])(
      'dequeue $taskType task and get $jobType job with corresponding taskType',
      async ({ jobType, taskType, job, task, instanceType }) => {
        testContext = await setupJobProcessorTest({ useMockQueueClient: false, instanceType });

        const { jobProcessor, configMock, queueClient } = testContext;
        const jobManagerBaseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
        const heartbeatBaseUrl = configMock.get<string>('jobManagement.config.heartbeat.baseUrl');
        const consumeTaskUrl = `/tasks/${jobType}/${taskType}/startPending`;
        const updateJobUrl = `/jobs/${task.jobId}`;
        const misMatchRegex = /^\/tasks\/[^/]+\/[^/]+\/startPending$/;

        emitter.on('no match', () => {
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

        const dequeueSpy = vi.spyOn(queueClient, 'dequeue');
        const getJobSpy = vi.spyOn(queueClient.jobManagerClient, 'getJob');

        const jobAndTask = await jobProcessor['getJobAndTaskResponse']();

        const receivedJobWithDateObject = {
          ...jobAndTask?.job,
          expirationDate: new Date(jobAndTask?.job.expirationDate ?? ''),
        };

        expect(dequeueSpy).toHaveBeenCalledWith(jobType, taskType);
        expect(getJobSpy).toHaveBeenCalledWith(task.jobId);
        expect(jobAndTask?.task.type).toEqual(taskType);
        expect(receivedJobWithDateObject).toEqual(job);

        await queueClient.heartbeatClient.stop(task.id);
      }
    );

    it('should continue to the next iteration if task reached max attempts', async () => {
      testContext = await setupJobProcessorTest({ useMockQueueClient: false });
      setValue('jobManagement.polling.maxTaskAttempts', 3);

      const { jobProcessor, configMock, queueClient, jobTrackerClientMock } = testContext;
      const jobManagerBaseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
      const heartbeatBaseUrl = configMock.get<string>('jobManagement.config.heartbeat.baseUrl');
      const job = createTasksTestCases[0]!.job;
      const task = createTasksTestCases[0]!.task;
      const jobType = job.type;
      const taskType = task.type;

      // nock setup
      const consumeTaskUrl = `/tasks/${jobType}/${taskType}/startPending`;
      const updateTaskUrl = `/jobs/${job.id}/tasks/${task.id}`;
      const updateJobUrl = `/jobs/${job.id}`;
      const misMatchRegex = /^\/tasks\/[^/]+\/[^/]+\/startPending$/;
      const dequeuedTask = { ...task, attempts: 3 };

      emitter.on('no match', () => {
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

      const dequeueSpy = vi.spyOn(queueClient, 'dequeue');

      const jobAndTask = await jobProcessor['getJobAndTaskResponse']();

      expect(dequeueSpy).toHaveBeenCalledWith(jobType, taskType);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(jobTrackerClientMock.notify).toHaveBeenCalledWith(dequeuedTask);
      expect(jobAndTask).toBeUndefined();

      await queueClient.heartbeatClient.stop(dequeuedTask.id);
    });

    it('should throw an error if an error occurred during dequeue task and get job', async () => {
      testContext = await setupJobProcessorTest({ useMockQueueClient: false });

      const { jobProcessor, configMock, queueClient } = testContext;
      const jobManagerBaseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
      const jobType = createTasksTestCases[0]!.jobType;
      const taskType = createTasksTestCases[0]!.taskType;
      const consumeTaskUrl = `/tasks/${jobType}/${taskType}/startPending`;
      const misMatchRegex = /^\/tasks\/[^/]+\/[^/]+\/startPending$/;

      emitter.on('no match', () => {
        nock(jobManagerBaseUrl).post(misMatchRegex).reply(404, undefined).persist();
      });

      nock(jobManagerBaseUrl).post(consumeTaskUrl).reply(500, 'Request failed with status code 500').persist();

      const dequeueSpy = vi.spyOn(queueClient, 'dequeue');

      await expect(jobProcessor['getJobAndTaskResponse']()).rejects.toThrow('Request failed with status code 500');
      expect(dequeueSpy).toHaveBeenCalledWith(jobType, taskType);
    });
  });

  describe('getJob', () => {
    it('should update job status to IN_PROGRESS when task type is init', async () => {
      const { jobProcessor, mockGetJob, mockUpdateJob, configMock } = testContext;
      const { tasks } = configMock.get<PollingConfig>('jobManagement.polling');
      const job = createTasksTestCases[3]!.job; // export init job

      mockGetJob.mockResolvedValueOnce(job);
      mockUpdateJob.mockResolvedValueOnce(undefined);

      const result = await jobProcessor['getJob'](job.id, tasks.init);

      expect(mockGetJob).toHaveBeenCalledWith(job.id);
      expect(mockUpdateJob).toHaveBeenCalledWith(job.id, { status: OperationStatus.IN_PROGRESS });
      expect(result).toEqual(job);
    });

    it('should update job status to IN_PROGRESS when task type is delete', async () => {
      const { jobProcessor, mockGetJob, mockUpdateJob, configMock } = testContext;
      const { tasks } = configMock.get<PollingConfig>('jobManagement.polling');
      const job = deleteTestCases[0]!.job;

      mockGetJob.mockResolvedValueOnce(job);
      mockUpdateJob.mockResolvedValueOnce(undefined);

      const result = await jobProcessor['getJob'](job.id, tasks.delete);

      expect(mockGetJob).toHaveBeenCalledWith(job.id);
      expect(mockUpdateJob).toHaveBeenCalledWith(job.id, { status: OperationStatus.IN_PROGRESS });
      expect(result).toEqual(job);
    });

    it('should not update job status when task type is neither init nor delete', async () => {
      const { jobProcessor, mockGetJob, mockUpdateJob, configMock } = testContext;
      const { tasks } = configMock.get<PollingConfig>('jobManagement.polling');
      const job = createTasksTestCases[0]!.job;

      mockGetJob.mockResolvedValueOnce(job);

      const result = await jobProcessor['getJob'](job.id, tasks.finalize);

      expect(mockGetJob).toHaveBeenCalledWith(job.id);
      expect(mockUpdateJob).not.toHaveBeenCalled();
      expect(result).toEqual(job);
    });
  });

  describe('getTask', () => {
    it('should return a task if it exists', async () => {
      const { jobProcessor, mockDequeue } = testContext;
      const jobType = createTasksTestCases[0]!.jobType;
      const taskType = createTasksTestCases[0]!.taskType;
      const task = createTasksTestCases[0]!.task;

      mockDequeue.mockResolvedValueOnce(task);

      const result = await jobProcessor['getTask'](jobType, taskType);

      expect(result.task).toEqual(task);
      expect(result.shouldSkipTask).toBe(false);
    });

    it('should return null if task does not exist', async () => {
      const { jobProcessor, mockDequeue } = testContext;
      const jobType = createTasksTestCases[0]!.jobType;
      const taskType = createTasksTestCases[0]!.taskType;

      mockDequeue.mockResolvedValueOnce(null);

      const result = await jobProcessor['getTask'](jobType, taskType);

      expect(result.task).toBeNull();
      expect(result.shouldSkipTask).toBe(true);
    });

    it('should return null if task reached max attempts', async () => {
      setValue('jobManagement.polling.maxTaskAttempts', 3);

      const { jobProcessor, mockDequeue, mockReject, mockUpdateJob } = testContext;
      const jobType = createTasksTestCases[0]!.jobType;
      const taskType = createTasksTestCases[0]!.taskType;
      const task = { ...createTasksTestCases[0]!.task, attempts: 3 };

      mockDequeue.mockResolvedValueOnce(task);
      mockReject.mockResolvedValueOnce(undefined);
      mockUpdateJob.mockResolvedValueOnce(undefined);

      const result = await jobProcessor['getTask'](jobType, taskType);

      expect(mockReject).toHaveBeenCalledTimes(1);
      expect(result.task).toBeNull();
      expect(result.shouldSkipTask).toBe(true);
    });

    it('should throw an error if an error occurred during dequeue task', async () => {
      const { jobProcessor, mockDequeue } = testContext;
      const jobType = createTasksTestCases[0]!.jobType;
      const taskType = createTasksTestCases[0]!.taskType;
      const error = new Error('test error');

      mockDequeue.mockRejectedValueOnce(error);

      await expect(jobProcessor['getTask'](jobType, taskType)).rejects.toThrow(error);
    });
  });

  describe('validateTaskAndJob', () => {
    it('should throw an error if no validation schemas exist for the job and task types', () => {
      const { jobProcessor } = testContext;
      const job = { ...createTasksTestCases[0]!.job, type: 'nonExistingJobType' };
      const task = { ...createTasksTestCases[0]!.task, type: 'nonExistingTaskType' };

      const action = () => {
        jobProcessor['validateTaskAndJob'](jobAndTask);
      };
      const jobAndTask: JobAndTaskResponse = { job, task };

      expect(action).toThrow();
    });
  });
});
