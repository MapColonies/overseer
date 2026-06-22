import type { Mocked, MockedFunction } from 'vitest';
import { TaskHandler as QueueClient, type IJobResponse, type ITaskResponse } from '@map-colonies/mc-priority-queue';
import { TileOutputFormat } from '@map-colonies/raster-shared';
import { TileRanger, zoomLevelToResolutionDeg } from '@map-colonies/mc-utils';
import { getTestLogger } from '../../../configurations/testLogger';
import { configMock } from '../../mocks/configMock';
import type { JobManagerConfig, MergeTaskParameters, JobResumeState, MergeTilesTaskParams } from '../../../../src/common/interfaces';
import { Grid } from '../../../../src/common/interfaces';
import { TileMergeTaskManager } from '../../../../src/task/models/tileMergeTaskManager';
import { taskMetricsMock } from '../../mocks/metricsMock';
import { tracerMock } from '../../mocks/tracerMock';
import { createFakePolygonalGeometry } from '../../mocks/geometryMockData';

// eslint-disable-next-line @typescript-eslint/no-magic-numbers
const TEST_INGESTION_RESOLUTION = zoomLevelToResolutionDeg(4)!;

export type MockDequeue = MockedFunction<(jobType: string, taskType: string) => Promise<ITaskResponse<unknown> | null>>;
export type MockGetJob = MockedFunction<(jobId: string) => Promise<IJobResponse<unknown, unknown>>>;
export type MockUpdateJob = MockedFunction<(jobId: string, update: Record<string, unknown>) => Promise<void>>;

export interface MergeTilesTaskBuilderContext {
  tileMergeTaskManager: TileMergeTaskManager;
}

export async function setupMergeTilesTaskBuilderTest(useMockQueueClient = false): Promise<MergeTilesTaskBuilderContext> {
  const mockLogger = await getTestLogger();

  const mockDequeue = vi.fn() as MockDequeue;
  const mockGetJob = vi.fn() as MockGetJob;
  const mockUpdateJob = vi.fn() as MockUpdateJob;

  const mockQueueClient = {
    dequeue: mockDequeue,
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
  const tileMergeTaskManager = new TileMergeTaskManager(mockLogger, tracerMock, configMock, new TileRanger(), queueClient, taskMetricsMock);
  return {
    tileMergeTaskManager,
  };
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function* createTaskGenerator(numTasks: number): AsyncGenerator<
  {
    mergeTasksGenerator: MergeTaskParameters;
    latestTaskIndex: JobResumeState;
  },
  void,
  void
> {
  for (let i = 0; i < numTasks; i++) {
    yield {
      mergeTasksGenerator: {
        isNewTarget: true,
        targetFormat: TileOutputFormat.PNG,
        sources: [{ path: 'layerRelativePath', type: 'source' }],
        batches: [{ maxX: 1, maxY: 1, minX: 0, minY: 0, zoom: 1 }],
      },
      latestTaskIndex: { lastInsertedTaskIndex: i, zoomLevel: 1 },
    };
  }
}

export const createMergeTilesTaskParams = (): MergeTilesTaskParams => {
  return {
    taskMetadata: {
      layerRelativePath: 'layerRelativePath',
      tileOutputFormat: TileOutputFormat.PNG,
      isNewTarget: true,
      grid: Grid.TWO_ON_ONE,
    },
    inputFiles: {
      gpkgFilesPath: ['/originDirectory/file'],
      metadataShapefilePath: '/originDirectory/metadata.shp',
      productShapefilePath: '/originDirectory/product.shp',
    },
    ingestionResolution: TEST_INGESTION_RESOLUTION,
    productGeometry: createFakePolygonalGeometry(),
  };
};
