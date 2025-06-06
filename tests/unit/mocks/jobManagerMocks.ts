import { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { JobTrackerClient } from '../../../src/httpClients/jobTrackerClient';

export const jobManagerClientMock = {
  updateJob: jest.fn(),
  updateTask: jest.fn(),
  createTaskForJob: jest.fn(),
  getJob: jest.fn(),
} as unknown as jest.Mocked<JobManagerClient>;

export const queueClientMock = {
  jobManagerClient: jobManagerClientMock,
  ack: jest.fn(),
  reject: jest.fn(),
} as unknown as jest.Mocked<QueueClient>;

export const jobTrackerClientMock = {
  notify: jest.fn(),
} as unknown as jest.Mocked<JobTrackerClient>;
