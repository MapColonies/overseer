import type { Mocked, MockedFunction } from 'vitest';
import type { IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { getTestLogger } from '../../../configurations/testLogger';
import type { JobManagerConfig } from '../../../../src/common/interfaces';
import type { JobTrackerClient } from '../../../../src/httpClients/jobTrackerClient';
import type { JobHandlerFactory } from '../../../../src/job/models/jobHandlerFactory';
import { JobProcessor } from '../../../../src/job/models/jobProcessor';
import type { InstanceType } from '../../../../src/utils/zod/schemas/instance.schema';
import { configMock } from '../../mocks/configMock';
import { jobTrackerClientMock } from '../../mocks/jobManagerMocks';
import { tracerMock } from '../../mocks/tracerMock';

export type MockDequeue = MockedFunction<(jobType: string, taskType: string) => Promise<ITaskResponse<unknown> | null>>;
export type MockGetJob = MockedFunction<(jobId: string) => Promise<IJobResponse<unknown, unknown>>>;
export type MockUpdateJob = MockedFunction<(jobId: string, update: Record<string, unknown>) => Promise<void>>;
export type MockReject = MockedFunction<(jobId: string, taskId: string, isRecoverable: boolean, message: string) => Promise<void>>;

export interface JobProcessorTestContext {
  jobProcessor: JobProcessor;
  mockJobHandlerFactory: MockedFunction<JobHandlerFactory>;
  mockDequeue: MockDequeue;
  mockGetJob: MockGetJob;
  mockReject: MockReject;
  mockUpdateJob: MockUpdateJob;
  configMock: typeof configMock;
  queueClient: QueueClient;
  jobTrackerClientMock: Mocked<JobTrackerClient>;
}

export function setupJobProcessorTest({
  instanceType = 'ingestion',
  useMockQueueClient = false,
}: {
  useMockQueueClient?: boolean;
  instanceType?: InstanceType;
}): JobProcessorTestContext {
  const mockLogger = getTestLogger();

  const mockJobHandlerFactory = vi.fn();

  const mockDequeue = vi.fn() as MockDequeue;
  const mockGetJob = vi.fn() as MockGetJob;
  const mockUpdateJob = vi.fn() as MockUpdateJob;
  const mockReject = vi.fn() as MockReject;

  const mockQueueClient = {
    dequeue: mockDequeue,
    reject: mockReject,
    jobManagerClient: {
      getJob: mockGetJob,
      updateJob: mockUpdateJob,
    },
  } as unknown as Mocked<QueueClient>;

  const jobManagerConfig = configMock.get<JobManagerConfig>('jobManagement.config');

  const queueClientInstance = new QueueClient(
    mockLogger,
    jobManagerConfig.jobManagerBaseUrl,
    jobManagerConfig.heartbeat.baseUrl,
    jobManagerConfig.dequeueIntervalMs,
    jobManagerConfig.heartbeat.intervalMs
  );

  const queueClient = useMockQueueClient ? mockQueueClient : queueClientInstance;
  const jobProcessor = new JobProcessor(mockLogger, tracerMock, configMock, instanceType, mockJobHandlerFactory, queueClient, jobTrackerClientMock);
  return {
    jobProcessor,
    mockJobHandlerFactory,
    mockDequeue,
    mockGetJob,
    mockUpdateJob,
    mockReject,
    configMock,
    queueClient,
    jobTrackerClientMock,
  };
}
