import nock from 'nock';
import type { ITaskResponse } from '@map-colonies/mc-priority-queue';
import { getTestLogger } from '../../configurations/testLogger';
import { configMock, registerDefaultConfig } from '../mocks/configMock';
import { JobTrackerClient } from '../../../src/httpClients/jobTrackerClient';
import { tracerMock } from '../mocks/tracerMock';
import { createFakeTask } from '../mocks/tasksMockData';

describe('JobTrackerClient', () => {
  let jobTrackerClient: JobTrackerClient;
  let jobTrackerUrl: string;
  let task: ITaskResponse<unknown>;

  beforeEach(async () => {
    registerDefaultConfig();
    task = createFakeTask<unknown>();
    jobTrackerUrl = configMock.get<string>('servicesUrl.jobTracker');
    jobTrackerClient = new JobTrackerClient(configMock, await getTestLogger(), tracerMock);
  });

  afterEach(() => {
    // eslint-disable-next-line import-x/no-named-as-default-member
    nock.cleanAll();
    vi.resetAllMocks();
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
