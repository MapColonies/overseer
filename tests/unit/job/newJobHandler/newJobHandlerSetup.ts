import type { Mocked } from 'vitest';
import type { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { getTestLogger } from '../../../configurations/testLogger';
import type { TileMergeTaskManager } from '../../../../src/task/models/tileMergeTaskManager';
import type { MapproxyApiClient } from '../../../../src/httpClients/mapproxyClient';
import type { GeoserverClient } from '../../../../src/httpClients/geoserverClient';
import type { CatalogClient } from '../../../../src/httpClients/catalogClient';
import { NewJobHandler } from '../../../../src/job/models/ingestion/newJobHandler';
import { taskMetricsMock } from '../../mocks/metricsMock';
import { jobManagerClientMock, jobTrackerClientMock, queueClientMock } from '../../mocks/jobManagerMocks';
import { tracerMock } from '../../mocks/tracerMock';
import type { JobTrackerClient } from '../../../../src/httpClients/jobTrackerClient';
import { configMock } from '../../mocks/configMock';
import { polygonPartsManagerClientMock } from '../../mocks/polygonPartsManagerClientMock';
import type { PolygonPartsMangerClient } from '../../../../src/httpClients/polygonPartsMangerClient';
import { readProductGeometryMock } from '../../mocks/productReaderMock';

export interface NewJobHandlerTestContext {
  newJobHandler: NewJobHandler;
  taskBuilderMock: Mocked<TileMergeTaskManager>;
  queueClientMock: Mocked<QueueClient>;
  jobManagerClientMock: Mocked<JobManagerClient>;
  mapproxyClientMock: Mocked<MapproxyApiClient>;
  geoserverClientMock: Mocked<GeoserverClient>;
  catalogClientMock: Mocked<CatalogClient>;
  jobTrackerClientMock: Mocked<JobTrackerClient>;
  polygonPartsManagerClientMock: Mocked<PolygonPartsMangerClient>;
}

export const setupNewJobHandlerTest = async (): Promise<NewJobHandlerTestContext> => {
  const taskBuilderMock = {
    buildTasks: vi.fn(),
    pushTasks: vi.fn(),
  } as unknown as Mocked<TileMergeTaskManager>;

  const mapproxyClientMock = { publish: vi.fn() } as unknown as Mocked<MapproxyApiClient>;
  const geoserverClientMock = { publish: vi.fn() } as unknown as Mocked<GeoserverClient>;
  const catalogClientMock = { publish: vi.fn() } as unknown as Mocked<CatalogClient>;

  const newJobHandler = new NewJobHandler(
    await getTestLogger(),
    configMock,
    tracerMock,
    taskBuilderMock,
    queueClientMock,
    catalogClientMock,
    mapproxyClientMock,
    geoserverClientMock,
    jobTrackerClientMock,
    polygonPartsManagerClientMock,
    readProductGeometryMock,
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
    polygonPartsManagerClientMock,
  };
};
