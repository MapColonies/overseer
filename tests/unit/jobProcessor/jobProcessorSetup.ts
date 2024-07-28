import { IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import { Logger } from '@map-colonies/js-logger';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { JobProcessor } from '../../../src/models/jobProcessor';
import { JobHandlerFactory } from '../../../src/models/jobHandlerFactory';
import { configMock } from '../mocks/configMock';

export type MockDequeue = jest.MockedFunction<(jobType: string, taskType: string) => Promise<ITaskResponse<unknown> | null>>;
export type MockGetJob = jest.MockedFunction<(jobId: string) => Promise<IJobResponse<unknown, unknown>>>;

export interface JobProcessorTestContext {
  jobProcessor: JobProcessor;
  mockJobHandlerFactory: jest.MockedFunction<JobHandlerFactory>;
  mockDequeue: MockDequeue;
  mockGetJob: MockGetJob;
  configMock: typeof configMock;
}

export function setupJobProcessorTest(): JobProcessorTestContext {
  const mockLogger = {
    info: jest.fn(),
    fatal: jest.fn(),
    debug: jest.fn(),
  } as unknown as jest.Mocked<Logger>;

  const mockJobHandlerFactory = jest.fn();

  const mockDequeue = jest.fn() as MockDequeue;
  const mockGetJob = jest.fn() as MockGetJob;

  const mockQueueClient = {
    dequeue: mockDequeue,
    jobManagerClient: {
      getJob: mockGetJob,
    },
  } as unknown as jest.Mocked<QueueClient>;

  const jobProcessor = new JobProcessor(mockLogger, configMock, mockJobHandlerFactory, mockQueueClient);

  return {
    jobProcessor,
    mockJobHandlerFactory,
    mockDequeue,
    mockGetJob,
    configMock,
  };
}
