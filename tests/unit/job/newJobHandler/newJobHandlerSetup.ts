import jsLogger from '@map-colonies/js-logger';
import { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { TileMergeTaskManager } from '../../../../src/task/models/tileMergeTaskManager';
import { MapproxyApiClient } from '../../../../src/httpClients/mapproxyClient';
import { GeoserverClient } from '../../../../src/httpClients/geoserverClient';
import { CatalogClient } from '../../../../src/httpClients/catalogClient';
import { NewJobHandler } from '../../../../src/job/models/ingestion/newJobHandler';
import { taskMetricsMock } from '../../mocks/metricsMock';
import { jobManagerClientMock, jobTrackerClientMock, queueClientMock } from '../../mocks/jobManagerMocks';
import { tracerMock } from '../../mocks/tracerMock';
import { JobTrackerClient } from '../../../../src/httpClients/jobTrackerClient';

export interface NewJobHandlerTestContext {
  newJobHandler: NewJobHandler;
  taskBuilderMock: jest.Mocked<TileMergeTaskManager>;
  queueClientMock: jest.Mocked<QueueClient>;
  jobManagerClientMock: jest.Mocked<JobManagerClient>;
  mapproxyClientMock: jest.Mocked<MapproxyApiClient>;
  geoserverClientMock: jest.Mocked<GeoserverClient>;
  catalogClientMock: jest.Mocked<CatalogClient>;
  jobTrackerClientMock: jest.Mocked<JobTrackerClient>;
}

export const setupNewJobHandlerTest = (): NewJobHandlerTestContext => {
  const taskBuilderMock = {
    buildTasks: jest.fn(),
    pushTasks: jest.fn(),
  } as unknown as jest.Mocked<TileMergeTaskManager>;

  const mapproxyClientMock = { publish: jest.fn() } as unknown as jest.Mocked<MapproxyApiClient>;
  const geoserverClientMock = { publish: jest.fn() } as unknown as jest.Mocked<GeoserverClient>;
  const catalogClientMock = { publish: jest.fn() } as unknown as jest.Mocked<CatalogClient>;

  const newJobHandler = new NewJobHandler(
    jsLogger({ enabled: false }),
    tracerMock,
    taskBuilderMock,
    queueClientMock,
    catalogClientMock,
    mapproxyClientMock,
    geoserverClientMock,
    jobTrackerClientMock,
    taskMetricsMock
  );

  return {
    newJobHandler,
    taskBuilderMock,
    queueClientMock,
    jobManagerClientMock,
    mapproxyClientMock,
    geoserverClientMock,
    catalogClientMock,
    jobTrackerClientMock,
  };
};
