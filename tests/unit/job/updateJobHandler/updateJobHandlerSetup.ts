import jsLogger from '@map-colonies/js-logger';
import { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { configMock } from '../../mocks/configMock';
import { TileMergeTaskManager } from '../../../../src/task/models/tileMergeTaskManager';
import { TileDeletionTaskManager } from '../../../../src/task/models/deletionTaskManager';
import { MapproxyApiClient } from '../../../../src/httpClients/mapproxyClient';
import { CatalogClient } from '../../../../src/httpClients/catalogClient';
import { UpdateJobHandler } from '../../../../src/job/models/ingestion/updateJobHandler';
import { SeedingJobCreator } from '../../../../src/job/models/ingestion/seedingJobCreator';
import { taskMetricsMock } from '../../mocks/metricsMock';
import { jobManagerClientMock, jobTrackerClientMock, queueClientMock } from '../../mocks/jobManagerMocks';
import { tracerMock } from '../../mocks/tracerMock';
import { JobTrackerClient } from '../../../../src/httpClients/jobTrackerClient';
import { polygonPartsManagerClientMock } from '../../mocks/polygonPartsManagerClientMock';
import { readProductGeometryMock } from '../../mocks/productReaderMock';
import { PolygonPartsMangerClient } from '../../../../src/httpClients/polygonPartsMangerClient';

export interface UpdateJobHandlerTestContext {
  updateJobHandler: UpdateJobHandler;
  taskBuilderMock: jest.Mocked<TileMergeTaskManager>;
  tileDeletionTaskManagerMock: jest.Mocked<TileDeletionTaskManager>;
  queueClientMock: jest.Mocked<QueueClient>;
  jobManagerClientMock: jest.Mocked<JobManagerClient>;
  mapproxyClientMock: jest.Mocked<MapproxyApiClient>;
  catalogClientMock: jest.Mocked<CatalogClient>;
  seedingJobCreatorMock: jest.Mocked<SeedingJobCreator>;
  jobTrackerClientMock: jest.Mocked<JobTrackerClient>;
  polygonPartsManagerClientMock: jest.Mocked<PolygonPartsMangerClient>;
  readProductGeometryMock: jest.MockedFunction<typeof readProductGeometryMock>;
}

export const setupUpdateJobHandlerTest = (): UpdateJobHandlerTestContext => {
  const taskBuilderMock = {
    buildAndPushTasks: jest.fn(),
  } as unknown as jest.Mocked<TileMergeTaskManager>;

  const tileDeletionTaskManagerMock = {
    buildAndPushTasks: jest.fn(),
  } as unknown as jest.Mocked<TileDeletionTaskManager>;

  const mapproxyClientMock = { publish: jest.fn() } as unknown as jest.Mocked<MapproxyApiClient>;
  const catalogClientMock = { publish: jest.fn(), update: jest.fn() } as unknown as jest.Mocked<CatalogClient>;

  const seedingJobCreatorMock = { create: jest.fn() } as unknown as jest.Mocked<SeedingJobCreator>;
  const updateJobHandler = new UpdateJobHandler(
    jsLogger({ enabled: false }),
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
