import jsLogger from '@map-colonies/js-logger';
import { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { TileMergeTaskManager } from '../../../../src/task/models/tileMergeTaskManager';
import { MapproxyApiClient } from '../../../../src/httpClients/mapproxyClient';
import { CatalogClient } from '../../../../src/httpClients/catalogClient';
import { SwapJobHandler } from '../../../../src/job/models/swapJobHandler';
import { SeedingJobCreator } from '../../../../src/job/models/seedingJobCreator';
import { taskMetricsMock } from '../../mocks/metricsMock';

export interface SwapJobHandlerTestContext {
  swapJobHandler: SwapJobHandler;
  taskBuilderMock: jest.Mocked<TileMergeTaskManager>;
  queueClientMock: jest.Mocked<QueueClient>;
  jobManagerClientMock: jest.Mocked<JobManagerClient>;
  mapproxyClientMock: jest.Mocked<MapproxyApiClient>;
  catalogClientMock: jest.Mocked<CatalogClient>;
  seedingJobCreatorMock: jest.Mocked<SeedingJobCreator>;
}

export const setupSwapJobHandlerTest = (): SwapJobHandlerTestContext => {
  const taskBuilderMock = {
    buildTasks: jest.fn(),
    pushTasks: jest.fn(),
  } as unknown as jest.Mocked<TileMergeTaskManager>;

  const jobManagerClientMock = {
    updateJob: jest.fn(),
    updateTask: jest.fn(),
  } as unknown as jest.Mocked<JobManagerClient>;

  const queueClientMock = {
    jobManagerClient: jobManagerClientMock,
    ack: jest.fn(),
    reject: jest.fn(),
  } as unknown as jest.Mocked<QueueClient>;

  const mapproxyClientMock = { update: jest.fn() } as unknown as jest.Mocked<MapproxyApiClient>;
  const catalogClientMock = { update: jest.fn() } as unknown as jest.Mocked<CatalogClient>;
  const seedingJobCreatorMock = { create: jest.fn() } as unknown as jest.Mocked<SeedingJobCreator>;

  const swapJobHandler = new SwapJobHandler(
    jsLogger({ enabled: false }),
    queueClientMock,
    taskBuilderMock,
    mapproxyClientMock,
    catalogClientMock,
    seedingJobCreatorMock,
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
  };
};
