import type { Mocked, MockedFunction } from 'vitest';
import type { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { getTestLogger } from '../../../configurations/testLogger';
import type { TileMergeTaskManager } from '../../../../src/task/models/tileMergeTaskManager';
import type { MapproxyApiClient } from '../../../../src/httpClients/mapproxyClient';
import type { CatalogClient } from '../../../../src/httpClients/catalogClient';
import { SwapJobHandler } from '../../../../src/job/models/ingestion/swapJobHandler';
import type { CacheDeletionJobCreator } from '../../../../src/job/models/ingestion/cacheDeletionJobCreator';
import { taskMetricsMock } from '../../mocks/metricsMock';
import { jobManagerClientMock, jobTrackerClientMock, queueClientMock } from '../../mocks/jobManagerMocks';
import { tracerMock } from '../../mocks/tracerMock';
import type { JobTrackerClient } from '../../../../src/httpClients/jobTrackerClient';
import { configMock } from '../../mocks/configMock';
import { polygonPartsManagerClientMock } from '../../mocks/polygonPartsManagerClientMock';
import { readProductGeometryMock } from '../../mocks/productReaderMock';
import type { PolygonPartsMangerClient } from '../../../../src/httpClients/polygonPartsMangerClient';

export interface SwapJobHandlerTestContext {
  swapJobHandler: SwapJobHandler;
  taskBuilderMock: Mocked<TileMergeTaskManager>;
  queueClientMock: Mocked<QueueClient>;
  jobManagerClientMock: Mocked<JobManagerClient>;
  mapproxyClientMock: Mocked<MapproxyApiClient>;
  catalogClientMock: Mocked<CatalogClient>;
  cacheDeletionJobCreatorMock: Mocked<CacheDeletionJobCreator>;
  jobTrackerClientMock: Mocked<JobTrackerClient>;
  polygonPartsManagerClientMock: Mocked<PolygonPartsMangerClient>;
  readProductGeometryMock: MockedFunction<typeof readProductGeometryMock>;
}

export const setupSwapJobHandlerTest = async (): Promise<SwapJobHandlerTestContext> => {
  const taskBuilderMock = {
    buildTasks: vi.fn(),
    pushTasks: vi.fn(),
  } as unknown as Mocked<TileMergeTaskManager>;

  const mapproxyClientMock = { update: vi.fn() } as unknown as Mocked<MapproxyApiClient>;
  const catalogClientMock = { update: vi.fn() } as unknown as Mocked<CatalogClient>;
  const cacheDeletionJobCreatorMock = { create: vi.fn() } as unknown as Mocked<CacheDeletionJobCreator>;

  const swapJobHandler = new SwapJobHandler(
    await getTestLogger(),
    configMock,
    tracerMock,
    queueClientMock,
    taskBuilderMock,
    mapproxyClientMock,
    catalogClientMock,
    cacheDeletionJobCreatorMock,
    jobTrackerClientMock,
    polygonPartsManagerClientMock,
    readProductGeometryMock,
    taskMetricsMock
  );

  return {
    swapJobHandler,
    taskBuilderMock,
    queueClientMock,
    jobManagerClientMock,
    mapproxyClientMock,
    catalogClientMock,
    cacheDeletionJobCreatorMock,
    jobTrackerClientMock,
    polygonPartsManagerClientMock,
    readProductGeometryMock,
  };
};
