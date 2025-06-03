import nock from 'nock';
import { container } from 'tsyringe';
import { SERVICES } from '../../../../src/common/constants';
import type { IConfig } from '../../../../src/common/interfaces';
import { JobProcessor } from '../../../../src/job/models/jobProcessor';
import { setValue } from '../../../unit/mocks/configMock';
import { ingestionUpdateJob } from '../../../unit/mocks/jobsMockData';
import { initTaskForIngestionUpdate } from '../../../unit/mocks/tasksMockData';
import { registerTestValues } from '../../testContainerConfig';

describe('handleJobInit Integration Test', () => {
  let jobProcessor: JobProcessor;
  let config: IConfig;
  let jobManagerBaseUrl: string;
  const jobType: string = 'Ingestion_Update';
  const taskType: string = 'init';

  beforeAll(() => {
    registerTestValues();
    container.register('Ingestion_Update', { useValue: jobType });
    // container.register(SERVICES.CONFIG, { useValue: configMock });
    // container.register(SERVICES.LOGGER, { useValue: jsLogger({ enabled: false }) });
    // container.register(SERVICES.TRACER, { useValue: tracerMock });
    // container.register(TileMergeTaskManager, { useValue: taskBuilderMock });
    // container.register(SERVICES.QUEUE_CLIENT, { useValue: queueClientMock });
    // container.register(CatalogClient, { useValue: catalogClientMock });
    // container.register(SeedingJobCreator, { useValue: seedingJobCreatorMock });
    // container.register(JobTrackerClient, { useValue: jobTrackerClientMock });
    // container.register(INJECTION_VALUES.ingestionJobTypes, { useValue: handlersTokens });
    // container.register(TaskMetrics, { useValue: taskMetricsMock });
    // container.register(handlersTokens.Ingestion_Update, { useClass: UpdateJobHandler });
  });

  afterAll(() => {
    nock.cleanAll();
  });

  beforeEach(() => {
    // queueClient = container.resolve(SERVICES.QUEUE_CLIENT);
    config = container.resolve<IConfig>(SERVICES.CONFIG);
    jobManagerBaseUrl = config.get('jobManagement.config.jobManagerBaseUrl');
    // const { jobs, tasks } = config.get<PollingConfig>('jobManagement.polling');
    // const pollingJobs = config.get<PollingConfig>('jobManagement.polling');
    // console.log(pollingJobs.jobs.update?.type, pollingJobs.jobs.new?.type);

    // await jobProcessor.start();
  });

  afterEach(() => {
    // jobProcessor.stop();
  });

  it('should process job for Ingestion_Update successfully', async () => {
    setValue('jobManagement.polling.tasks', {
      init: 'init',
    });
    setValue('jobManagement.polling.jobs', {
      update: {
        type: 'Ingestion_Update',
      },
    });
    // jobProcessor = container.resolve(JobProcessor);

    // generate a job
    nock(jobManagerBaseUrl).post(`/tasks/${jobType}/${taskType}/startPending`).reply(200, initTaskForIngestionUpdate);
    const jobId = initTaskForIngestionUpdate.jobId;
    // TODO: consider moving jobsMockData.ts into another folder
    nock(jobManagerBaseUrl).get(`/jobs/${jobId}`).query({ shouldReturnTasks: false }).reply(200, ingestionUpdateJob);
    nock(jobManagerBaseUrl).put(`/jobs/${jobId}`).reply(200, {});
    // const result = await handleJobInit(); // Call the function to test
    // expect(result).toEqual({ success: true });
    // await jobProcessor.start();
  }, 1000000);

  // it.only('tester', () => {
  //   expect(1).toBe(1);
  // });
});
