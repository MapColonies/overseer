import type { Mocked } from 'vitest';
import type { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import type { JobTrackerClient } from '../../../src/httpClients/jobTrackerClient';

export const jobManagerClientMock = {
  updateJob: vi.fn(),
  updateTask: vi.fn(),
  createTaskForJob: vi.fn(),
  getJob: vi.fn(),
  findTasks: vi.fn(),
} as unknown as Mocked<JobManagerClient>;

export const queueClientMock = {
  jobManagerClient: jobManagerClientMock,
  ack: vi.fn(),
  reject: vi.fn(),
} as unknown as Mocked<QueueClient>;

export const jobTrackerClientMock = {
  notify: vi.fn(),
} as unknown as Mocked<JobTrackerClient>;
