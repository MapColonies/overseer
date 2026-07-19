import type { Mocked } from 'vitest';
import type { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { getTestLogger } from '../../../configurations/testLogger';
import type { MapproxyApiClient } from '../../../../src/httpClients/mapproxyClient';
import type { CatalogClient } from '../../../../src/httpClients/catalogClient';
import type { GeoserverClient } from '../../../../src/httpClients/geoserverClient';
import type { PolygonPartsMangerClient } from '../../../../src/httpClients/polygonPartsMangerClient';
import type { JobTrackerClient } from '../../../../src/httpClients/jobTrackerClient';
import { DeleteLayerHandler } from '../../../../src/job/models/deletion/deleteLayerHandler';
import { taskMetricsMock } from '../../mocks/metricsMock';
import { jobManagerClientMock, jobTrackerClientMock, queueClientMock } from '../../mocks/jobManagerMocks';
import { tracerMock } from '../../mocks/tracerMock';
import { configMock } from '../../mocks/configMock';
import { polygonPartsManagerClientMock } from '../../mocks/polygonPartsManagerClientMock';

export interface DeleteLayerHandlerTestContext {
  deleteLayerHandler: DeleteLayerHandler;
  queueClientMock: Mocked<QueueClient>;
  jobManagerClientMock: Mocked<JobManagerClient>;
  catalogClientMock: Mocked<CatalogClient>;
  geoserverClientMock: Mocked<GeoserverClient>;
  polygonPartsManagerClientMock: Mocked<PolygonPartsMangerClient>;
  mapproxyClientMock: Mocked<MapproxyApiClient>;
  jobTrackerClientMock: Mocked<JobTrackerClient>;
}

export const setupDeleteLayerHandlerTest = async (): Promise<DeleteLayerHandlerTestContext> => {
  const catalogClientMock = { deleteRecord: vi.fn() } as unknown as Mocked<CatalogClient>;
  const geoserverClientMock = { unpublishLayer: vi.fn() } as unknown as Mocked<GeoserverClient>;
  const mapproxyClientMock = { removeLayer: vi.fn(), getLayerCache: vi.fn() } as unknown as Mocked<MapproxyApiClient>;

  const deleteLayerHandler = new DeleteLayerHandler(
    await getTestLogger(),
    configMock,
    tracerMock,
    queueClientMock,
    catalogClientMock,
    geoserverClientMock,
    polygonPartsManagerClientMock,
    mapproxyClientMock,
    jobTrackerClientMock,
    taskMetricsMock
  );

  return {
    deleteLayerHandler,
    queueClientMock,
    jobManagerClientMock,
    catalogClientMock,
    geoserverClientMock,
    polygonPartsManagerClientMock,
    mapproxyClientMock,
    jobTrackerClientMock,
  };
};
