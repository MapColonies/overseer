import nock from 'nock';
import { IConfig } from 'config';
import { DependencyContainer } from 'tsyringe';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { JobProcessor } from '../../src/models/jobProcessor';
import { SERVICES } from '../../src/common/constants';
import { ingestionNewJob, ingestionSwapUpdateJob, ingestionUpdateJob } from '../unit/mocks/jobsMockData';
import {
  finalizeTaskForIngestionNew,
  finalizeTaskForIngestionSwapUpdate,
  finalizeTaskForIngestionUpdate,
  initTaskForIngestionNew,
  initTaskForIngestionSwapUpdate,
  initTaskForIngestionUpdate,
} from '../unit/mocks/tasksMockData';
import { registerDependencies } from '../../src/common/dependencyRegistration';
import { getTestContainerConfig } from './helpers/containerConfig';

describe('JobProcessor', () => {
  let jobProcessor: JobProcessor;
  let jobManagerBaseUrl: string;
  let config: IConfig;
  let container: DependencyContainer;
  let queueClient: QueueClient;
  let heartbeatBaseUrl: string;

  beforeEach(() => {
    container = registerDependencies(getTestContainerConfig());
    jobProcessor = container.resolve(JobProcessor);
    config = container.resolve<IConfig>(SERVICES.CONFIG);
    queueClient = container.resolve<QueueClient>(SERVICES.QUEUE_CLIENT);
    heartbeatBaseUrl = config.get<string>('jobManagement.config.heartbeat.baseUrl');
    jobManagerBaseUrl = config.get<string>('jobManagement.config.jobManagerBaseUrl');
  });

  afterEach(() => {
    jest.clearAllMocks();
    nock.cleanAll();
  });

  describe('happy path', () => {
    const ingestionTestCases = [
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
        jobType: ingestionSwapUpdateJob.type,
        taskType: initTaskForIngestionSwapUpdate.type,
        job: ingestionSwapUpdateJob,
        task: initTaskForIngestionSwapUpdate,
      },
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

    test.each(ingestionTestCases)(
      'dequeue $taskType task and get $jobType job with corresponding taskType',
      async ({ jobType, taskType, job, task }) => {
        const consumeTaskUrl = `/tasks/${jobType}/${taskType}/startPending`;

        nock.emitter.on('no match', () => {
          nock(jobManagerBaseUrl).post(consumeTaskUrl).reply(404, undefined);
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

  describe('bad path', () => {
    it('should handle job manager error', async () => {
      const jobType = ingestionNewJob.type;
      const taskType = initTaskForIngestionNew.type;
      const consumeTaskUrl = `/tasks/${jobType}/${taskType}/startPending`;

      nock(jobManagerBaseUrl).post(consumeTaskUrl).reply(500);

      await expect(jobProcessor['getJobWithTaskType']()).rejects.toThrow();
    });
  });

  it('should handle missing job', async () => {
    const jobType = ingestionNewJob.type;
    const taskType = initTaskForIngestionNew.type;
    const consumeTaskUrl = `/tasks/${jobType}/${taskType}/startPending`;

    nock(jobManagerBaseUrl)
      .post(consumeTaskUrl)
      .reply(200, { ...initTaskForIngestionNew })
      .get(`/jobs/${initTaskForIngestionNew.jobId}?shouldReturnTasks=false`)
      .reply(404, { message: 'Job not found' });

    nock(heartbeatBaseUrl).post(`/heartbeat/${initTaskForIngestionNew.id}`).reply(200, 'ok').persist();

    await expect(jobProcessor['getJobWithTaskType']()).rejects.toThrow('Job not found');

    await queueClient.heartbeatClient.stop(initTaskForIngestionNew.id);
  });
});
