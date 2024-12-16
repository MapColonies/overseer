import jsLogger from '@map-colonies/js-logger';
import { trace, Tracer } from '@opentelemetry/api';
import { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { TileMergeTaskManager } from '../../../../src/task/models/tileMergeTaskManager';
import { MapproxyApiClient } from '../../../../src/httpClients/mapproxyClient';
import { GeoserverClient } from '../../../../src/httpClients/geoserverClient';
import { CatalogClient } from '../../../../src/httpClients/catalogClient';
import { NewJobHandler } from '../../../../src/job/models/newJobHandler';
import { taskMetricsMock } from '../../mocks/metricsMock';

export interface NewJobHandlerTestContext {
  newJobHandler: NewJobHandler;
  taskBuilderMock: jest.Mocked<TileMergeTaskManager>;
  queueClientMock: jest.Mocked<QueueClient>;
  jobManagerClientMock: jest.Mocked<JobManagerClient>;
  mapproxyClientMock: jest.Mocked<MapproxyApiClient>;
  geoserverClientMock: jest.Mocked<GeoserverClient>;
  catalogClientMock: jest.Mocked<CatalogClient>;
}

export const setupNewJobHandlerTest = (): NewJobHandlerTestContext => {
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

  const mapproxyClientMock = { publish: jest.fn() } as unknown as jest.Mocked<MapproxyApiClient>;
  const geoserverClientMock = { publish: jest.fn() } as unknown as jest.Mocked<GeoserverClient>;
  const catalogClientMock = { publish: jest.fn() } as unknown as jest.Mocked<CatalogClient>;
  const tracerMock = trace.getTracer('test');

  const newJobHandler = new NewJobHandler(
    jsLogger({ enabled: false }),
    tracerMock,
    taskBuilderMock,
    queueClientMock,
    catalogClientMock,
    mapproxyClientMock,
    geoserverClientMock,
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
  };
};
