import { IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import jsLogger from '@map-colonies/js-logger';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { JobProcessor } from '../../../src/models/jobProcessor';
import { JobHandlerFactory } from '../../../src/models/jobHandlerFactory';
import { configMock } from '../mocks/configMock';
import { IJobManagerConfig } from '../../../src/common/interfaces';

export type MockDequeue = jest.MockedFunction<(jobType: string, taskType: string) => Promise<ITaskResponse<unknown> | null>>;
export type MockGetJob = jest.MockedFunction<(jobId: string) => Promise<IJobResponse<unknown, unknown>>>;

export interface JobProcessorTestContext {
  jobProcessor: JobProcessor;
  mockJobHandlerFactory: jest.MockedFunction<JobHandlerFactory>;
  mockDequeue: MockDequeue;
  mockGetJob: MockGetJob;
  configMock: typeof configMock;
  queueClient: QueueClient;
}

export function setupJobProcessorTest({ useMockQueueClient = false }: { useMockQueueClient?: boolean }): JobProcessorTestContext {
  const mockLogger = jsLogger({ enabled: false });

  const mockJobHandlerFactory = jest.fn();

  const mockDequeue = jest.fn() as MockDequeue;
  const mockGetJob = jest.fn() as MockGetJob;

  const mockQueueClient = {
    dequeue: mockDequeue,
    jobManagerClient: {
      getJob: mockGetJob,
    },
  } as unknown as jest.Mocked<QueueClient>;

  const jobManagerConfig = configMock.get<IJobManagerConfig>('jobManagement.config');

  const queueClientInstance = new QueueClient(
    mockLogger,
    jobManagerConfig.jobManagerBaseUrl,
    jobManagerConfig.heartbeat.baseUrl,
    jobManagerConfig.dequeueIntervalMs,
    jobManagerConfig.heartbeat.intervalMs
  );

  const queueClient = useMockQueueClient ? mockQueueClient : queueClientInstance;
  const jobProcessor = new JobProcessor(mockLogger, configMock, mockJobHandlerFactory, queueClient);
  return {
    jobProcessor,
    mockJobHandlerFactory,
    mockDequeue,
    mockGetJob,
    configMock,
    queueClient,
  };
}
