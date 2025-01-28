import { IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import jsLogger from '@map-colonies/js-logger';
import { TileOutputFormat } from '@map-colonies/mc-model-types';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { TileRanger } from '@map-colonies/mc-utils';
import { trace } from '@opentelemetry/api';
import { configMock } from '../../mocks/configMock';
import { JobManagerConfig, MergeTaskParameters } from '../../../../src/common/interfaces';
import { TileMergeTaskManager } from '../../../../src/task/models/tileMergeTaskManager';
import { taskMetricsMock } from '../../mocks/metricsMock';

export type MockDequeue = jest.MockedFunction<(jobType: string, taskType: string) => Promise<ITaskResponse<unknown> | null>>;
export type MockGetJob = jest.MockedFunction<(jobId: string) => Promise<IJobResponse<unknown, unknown>>>;
export type MockUpdateJob = jest.MockedFunction<(jobId: string, update: Record<string, unknown>) => Promise<void>>;

export interface MergeTilesTaskBuilderContext {
  tileMergeTaskManager: TileMergeTaskManager;
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

  const jobManagerConfig = configMock.get<JobManagerConfig>('jobManagement.config');

  const queueClientInstance = new QueueClient(
    mockLogger,
    jobManagerConfig.jobManagerBaseUrl,
    jobManagerConfig.heartbeat.baseUrl,
    jobManagerConfig.dequeueIntervalMs,
    jobManagerConfig.heartbeat.intervalMs
  );

  const queueClient = useMockQueueClient ? mockQueueClient : queueClientInstance;
  const tracerMock = trace.getTracer('test');
  const tileMergeTaskManager = new TileMergeTaskManager(mockLogger, tracerMock, configMock, new TileRanger(), queueClient, taskMetricsMock);
  return {
    tileMergeTaskManager,
  };
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function* createTaskGenerator(numTasks: number): AsyncGenerator<MergeTaskParameters, void, void> {
  for (let i = 0; i < numTasks; i++) {
    yield {
      isNewTarget: true,
      targetFormat: TileOutputFormat.PNG,
      sources: [{ path: 'layerRelativePath', type: 'source' }],
      batches: [{ maxX: 1, maxY: 1, minX: 0, minY: 0, zoom: 1 }],
    };
  }
}
