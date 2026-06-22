import type { Mocked, MockedFunction } from 'vitest';
import type { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { getTestLogger } from '../../../configurations/testLogger';
import { configMock } from '../../mocks/configMock';
import type { TileMergeTaskManager } from '../../../../src/task/models/tileMergeTaskManager';
import type { TileDeletionTaskManager } from '../../../../src/task/models/deletionTaskManager';
import type { MapproxyApiClient } from '../../../../src/httpClients/mapproxyClient';
import type { CatalogClient } from '../../../../src/httpClients/catalogClient';
import { UpdateJobHandler } from '../../../../src/job/models/ingestion/updateJobHandler';
import type { SeedingJobCreator } from '../../../../src/job/models/ingestion/seedingJobCreator';
import { taskMetricsMock } from '../../mocks/metricsMock';
import { jobManagerClientMock, jobTrackerClientMock, queueClientMock } from '../../mocks/jobManagerMocks';
import { tracerMock } from '../../mocks/tracerMock';
import type { JobTrackerClient } from '../../../../src/httpClients/jobTrackerClient';
import { polygonPartsManagerClientMock } from '../../mocks/polygonPartsManagerClientMock';
import { readProductGeometryMock } from '../../mocks/productReaderMock';
import type { PolygonPartsMangerClient } from '../../../../src/httpClients/polygonPartsMangerClient';

export interface UpdateJobHandlerTestContext {
  updateJobHandler: UpdateJobHandler;
  taskBuilderMock: Mocked<TileMergeTaskManager>;
  tileDeletionTaskManagerMock: Mocked<TileDeletionTaskManager>;
  queueClientMock: Mocked<QueueClient>;
  jobManagerClientMock: Mocked<JobManagerClient>;
  mapproxyClientMock: Mocked<MapproxyApiClient>;
  catalogClientMock: Mocked<CatalogClient>;
  seedingJobCreatorMock: Mocked<SeedingJobCreator>;
  jobTrackerClientMock: Mocked<JobTrackerClient>;
  polygonPartsManagerClientMock: Mocked<PolygonPartsMangerClient>;
  readProductGeometryMock: MockedFunction<typeof readProductGeometryMock>;
}

export const setupUpdateJobHandlerTest = async (): Promise<UpdateJobHandlerTestContext> => {
  const taskBuilderMock = {
    buildAndPushTasks: vi.fn(),
  } as unknown as Mocked<TileMergeTaskManager>;

  const tileDeletionTaskManagerMock = {
    buildAndPushTasks: vi.fn(),
  } as unknown as Mocked<TileDeletionTaskManager>;

  const mapproxyClientMock = { publish: vi.fn() } as unknown as Mocked<MapproxyApiClient>;
  const catalogClientMock = { publish: vi.fn(), update: vi.fn() } as unknown as Mocked<CatalogClient>;

  const seedingJobCreatorMock = { create: vi.fn() } as unknown as Mocked<SeedingJobCreator>;
  const updateJobHandler = new UpdateJobHandler(
    await getTestLogger(),
    configMock,
    tracerMock,
    taskBuilderMock,
    tileDeletionTaskManagerMock,
    queueClientMock,
    catalogClientMock,
    seedingJobCreatorMock,
    jobTrackerClientMock,
    polygonPartsManagerClientMock,
    readProductGeometryMock,
    taskMetricsMock
  );

  return {
    updateJobHandler,
    taskBuilderMock,
    tileDeletionTaskManagerMock,
    queueClientMock,
    jobManagerClientMock,
    mapproxyClientMock,
    catalogClientMock,
    seedingJobCreatorMock,
    jobTrackerClientMock,
    polygonPartsManagerClientMock,
    readProductGeometryMock,
  };
};
