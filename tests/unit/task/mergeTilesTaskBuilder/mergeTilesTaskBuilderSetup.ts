import { IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import jsLogger from '@map-colonies/js-logger';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { TileRanger } from '@map-colonies/mc-utils';
import { configMock } from '../../mocks/configMock';
import { IJobManagerConfig } from '../../../../src/common/interfaces';
import { MergeTilesTaskBuilder } from '../../../../src/task/models/mergeTilesTaskBuilder';

export type MockDequeue = jest.MockedFunction<(jobType: string, taskType: string) => Promise<ITaskResponse<unknown> | null>>;
export type MockGetJob = jest.MockedFunction<(jobId: string) => Promise<IJobResponse<unknown, unknown>>>;
export type MockUpdateJob = jest.MockedFunction<(jobId: string, update: Record<string, unknown>) => Promise<void>>;

export interface MergeTilesTaskBuilderContext {
  mergeTilesTaskBuilder: MergeTilesTaskBuilder;
  configMock: typeof configMock;
  queueClient: QueueClient;
}

export function setupMergeTilesTaskBuilderTest(useMockQueueClient = false): MergeTilesTaskBuilderContext {
  const mockLogger = jsLogger({ enabled: false });

  const mockDequeue = jest.fn() as MockDequeue;
  const mockGetJob = jest.fn() as MockGetJob;
  const mockUpdateJob = jest.fn() as MockUpdateJob;

  const mockQueueClient = {
    dequeue: mockDequeue,
    jobManagerClient: {
      getJob: mockGetJob,
      updateJob: mockUpdateJob,
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
  const mergeTilesTaskBuilder = new MergeTilesTaskBuilder(mockLogger, configMock, new TileRanger(), queueClient);
  return {
    mergeTilesTaskBuilder,
    configMock,
    queueClient,
  };
}
