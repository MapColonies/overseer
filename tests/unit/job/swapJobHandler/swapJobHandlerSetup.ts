import jsLogger from '@map-colonies/js-logger';
import { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { TileMergeTaskManager } from '../../../../src/task/models/tileMergeTaskManager';
import { MapproxyApiClient } from '../../../../src/httpClients/mapproxyClient';
import { CatalogClient } from '../../../../src/httpClients/catalogClient';
import { SwapJobHandler } from '../../../../src/job/models/ingestion/swapJobHandler';
import { SeedingJobCreator } from '../../../../src/job/models/ingestion/seedingJobCreator';
import { taskMetricsMock } from '../../mocks/metricsMock';
import { jobManagerClientMock, jobTrackerClientMock, queueClientMock } from '../../mocks/jobManagerMocks';
import { tracerMock } from '../../mocks/tracerMock';
import { JobTrackerClient } from '../../../../src/httpClients/jobTrackerClient';

export interface SwapJobHandlerTestContext {
  swapJobHandler: SwapJobHandler;
  taskBuilderMock: jest.Mocked<TileMergeTaskManager>;
  queueClientMock: jest.Mocked<QueueClient>;
  jobManagerClientMock: jest.Mocked<JobManagerClient>;
  mapproxyClientMock: jest.Mocked<MapproxyApiClient>;
  catalogClientMock: jest.Mocked<CatalogClient>;
  seedingJobCreatorMock: jest.Mocked<SeedingJobCreator>;
  jobTrackerClientMock: jest.Mocked<JobTrackerClient>;
}

export const setupSwapJobHandlerTest = (): SwapJobHandlerTestContext => {
  const taskBuilderMock = {
    buildTasks: jest.fn(),
    pushTasks: jest.fn(),
  } as unknown as jest.Mocked<TileMergeTaskManager>;

  const mapproxyClientMock = { update: jest.fn() } as unknown as jest.Mocked<MapproxyApiClient>;
  const catalogClientMock = { update: jest.fn() } as unknown as jest.Mocked<CatalogClient>;
  const seedingJobCreatorMock = { create: jest.fn() } as unknown as jest.Mocked<SeedingJobCreator>;

  const swapJobHandler = new SwapJobHandler(
    jsLogger({ enabled: false }),
    tracerMock,
    queueClientMock,
    taskBuilderMock,
    mapproxyClientMock,
    catalogClientMock,
    seedingJobCreatorMock,
    jobTrackerClientMock,
    taskMetricsMock
  );

  return {
    swapJobHandler,
    taskBuilderMock,
    queueClientMock,
    jobManagerClientMock,
    mapproxyClientMock,
    catalogClientMock,
    seedingJobCreatorMock,
    jobTrackerClientMock,
  };
};
