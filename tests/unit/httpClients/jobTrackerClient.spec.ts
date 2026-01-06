import jsLogger from '@map-colonies/js-logger';
import nock from 'nock';
import { ITaskResponse } from '@map-colonies/mc-priority-queue';
import { configMock, registerDefaultConfig } from '../mocks/configMock';
import { JobTrackerClient } from '../../../src/httpClients/jobTrackerClient';
import { tracerMock } from '../mocks/tracerMock';
import { createFakeTask } from '../mocks/tasksMockData';

describe('JobTrackerClient', () => {
  let jobTrackerClient: JobTrackerClient;
  let jobTrackerUrl: string;
  let task: ITaskResponse<unknown>;

  beforeEach(() => {
    registerDefaultConfig();
    task = createFakeTask<unknown>();
    jobTrackerUrl = configMock.get<string>('servicesUrl.jobTracker');
    jobTrackerClient = new JobTrackerClient(configMock, jsLogger({ enabled: false }), tracerMock);
  });

  afterEach(() => {
    nock.cleanAll();
    jest.resetAllMocks();
  });

  describe('notify', () => {
    it('should successfully notify job tracker about the task', async () => {
      const scope = nock(jobTrackerUrl).post(`/tasks/${task.id}/notify`).reply(200);

      await jobTrackerClient.notify(task);

      expect(scope.isDone()).toBe(true);
    });

    it('should throw an error when the notification request fails', async () => {
      // Setup nock to intercept the request and return an error response
      nock(jobTrackerUrl).post(`/tasks/${task.id}/notify`).reply(500, { error: 'Internal server error' });

      await expect(jobTrackerClient.notify(task)).rejects.toThrow();
    });

    it('should handle connection errors gracefully', async () => {
      nock(jobTrackerUrl).post(`/tasks/${task.id}/notify`).replyWithError('Connection refused');

      await expect(jobTrackerClient.notify(task)).rejects.toThrow();
    });
  });
});
