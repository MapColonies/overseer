import { IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import jsLogger from '@map-colonies/js-logger';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { JobProcessor } from '../../../../src/job/models/jobProcessor';
import { JobHandlerFactory } from '../../../../src/job/models/jobHandlerFactory';
import { configMock } from '../../mocks/configMock';
import { JobManagerConfig } from '../../../../src/common/interfaces';
import { tracerMock } from '../../mocks/tracerMock';
import { JobTrackerClient } from '../../../../src/httpClients/jobTrackerClient';
import { jobTrackerClientMock } from '../../mocks/jobManagerMocks';

export type MockDequeue = jest.MockedFunction<(jobType: string, taskType: string) => Promise<ITaskResponse<unknown> | null>>;
export type MockGetJob = jest.MockedFunction<(jobId: string) => Promise<IJobResponse<unknown, unknown>>>;
export type MockUpdateJob = jest.MockedFunction<(jobId: string, update: Record<string, unknown>) => Promise<void>>;
export type MockReject = jest.MockedFunction<(jobId: string, taskId: string, isRecoverable: boolean, message: string) => Promise<void>>;

export interface JobProcessorTestContext {
  jobProcessor: JobProcessor;
  mockJobHandlerFactory: jest.MockedFunction<JobHandlerFactory>;
  mockDequeue: MockDequeue;
  mockGetJob: MockGetJob;
  mockReject: MockReject;
  mockUpdateJob: MockUpdateJob;
  configMock: typeof configMock;
  queueClient: QueueClient;
  jobTrackerClientMock: jest.Mocked<JobTrackerClient>;
}

export function setupJobProcessorTest({ useMockQueueClient = false }: { useMockQueueClient?: boolean }): JobProcessorTestContext {
  const mockLogger = jsLogger({ enabled: false });

  const mockJobHandlerFactory = jest.fn();

  const mockDequeue = jest.fn() as MockDequeue;
  const mockGetJob = jest.fn() as MockGetJob;
  const mockUpdateJob = jest.fn() as MockUpdateJob;
  const mockReject = jest.fn() as MockReject;

  const mockQueueClient = {
    dequeue: mockDequeue,
    reject: mockReject,
    jobManagerClient: {
      getJob: mockGetJob,
      updateJob: mockUpdateJob,
    },
  } as unknown as jest.Mocked<QueueClient>;

  const jobManagerConfig = configMock.get<JobManagerConfig>('jobManagement.config');

  const queueClientInstance = new QueueClient(
    mockLogger,
    jobManagerConfig.jobManagerBaseUrl,
    jobManagerConfig.heartbeat.baseUrl,
    jobManagerConfig.dequeueIntervalMs,
    jobManagerConfig.heartbeat.intervalMs
  );

  const queueClient = useMockQueueClient ? mockQueueClient : queueClientInstance;
  const jobProcessor = new JobProcessor(mockLogger, tracerMock, configMock, mockJobHandlerFactory, queueClient, jobTrackerClientMock);
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
