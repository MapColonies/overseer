import jsLogger from '@map-colonies/js-logger';
import { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { configMock } from '../../mocks/configMock';
import { TileMergeTaskManager } from '../../../../src/task/models/tileMergeTaskManager';
import { MapproxyApiClient } from '../../../../src/httpClients/mapproxyClient';
import { CatalogClient } from '../../../../src/httpClients/catalogClient';
import { UpdateJobHandler } from '../../../../src/job/models/ingestion/updateJobHandler';
import { SeedingJobCreator } from '../../../../src/job/models/ingestion/seedingJobCreator';
import { taskMetricsMock } from '../../mocks/metricsMock';
import { jobManagerClientMock, queueClientMock } from '../../mocks/jobManagerMocks';
import { tracerMock } from '../../mocks/tracerMock';

export interface UpdateJobHandlerTestContext {
  updateJobHandler: UpdateJobHandler;
  taskBuilderMock: jest.Mocked<TileMergeTaskManager>;
  queueClientMock: jest.Mocked<QueueClient>;
  jobManagerClientMock: jest.Mocked<JobManagerClient>;
  mapproxyClientMock: jest.Mocked<MapproxyApiClient>;
  catalogClientMock: jest.Mocked<CatalogClient>;
  seedingJobCreatorMock: jest.Mocked<SeedingJobCreator>;
}

export const setupUpdateJobHandlerTest = (): UpdateJobHandlerTestContext => {
  const taskBuilderMock = {
    buildTasks: jest.fn(),
    pushTasks: jest.fn(),
  } as unknown as jest.Mocked<TileMergeTaskManager>;

  const mapproxyClientMock = { publish: jest.fn() } as unknown as jest.Mocked<MapproxyApiClient>;
  const catalogClientMock = { publish: jest.fn(), update: jest.fn() } as unknown as jest.Mocked<CatalogClient>;

  const seedingJobCreatorMock = { create: jest.fn() } as unknown as jest.Mocked<SeedingJobCreator>;
  const updateJobHandler = new UpdateJobHandler(
    jsLogger({ enabled: false }),
    tracerMock,
    configMock,
    taskBuilderMock,
    queueClientMock,
    catalogClientMock,
    seedingJobCreatorMock,
    taskMetricsMock
  );

  return {
    updateJobHandler,
    taskBuilderMock,
    queueClientMock,
    jobManagerClientMock,
    mapproxyClientMock,
    catalogClientMock,
    seedingJobCreatorMock,
  };
};
