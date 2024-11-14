import jsLogger from '@map-colonies/js-logger';
import { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { configMock } from '../../mocks/configMock';
import { TileMergeTaskManager } from '../../../../src/task/models/tileMergeTaskManager';
import { MapproxyApiClient } from '../../../../src/httpClients/mapproxyClient';
import { CatalogClient } from '../../../../src/httpClients/catalogClient';
import { UpdateJobHandler } from '../../../../src/job/models/updateJobHandler';
import { SeedingJobCreator } from '../../../../src/job/models/seedingJobCreator';
import { PolygonPartMangerClient } from '../../../../src/httpClients/polygonPartMangerClient';

export interface UpdateJobHandlerTestContext {
  updateJobHandler: UpdateJobHandler;
  taskBuilderMock: jest.Mocked<TileMergeTaskManager>;
  queueClientMock: jest.Mocked<QueueClient>;
  jobManagerClientMock: jest.Mocked<JobManagerClient>;
  mapproxyClientMock: jest.Mocked<MapproxyApiClient>;
  catalogClientMock: jest.Mocked<CatalogClient>;
  seedingJobCreatorMock: jest.Mocked<SeedingJobCreator>;
  polygonPartMangerClientMock: jest.Mocked<PolygonPartMangerClient>;
}

export const setupUpdateJobHandlerTest = (): UpdateJobHandlerTestContext => {
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
  const catalogClientMock = { publish: jest.fn(), update: jest.fn() } as unknown as jest.Mocked<CatalogClient>;

  const seedingJobCreatorMock = { create: jest.fn() } as unknown as jest.Mocked<SeedingJobCreator>;

  const polygonPartMangerClientMock = { getAggregatedPartData: jest.fn() } as unknown as jest.Mocked<PolygonPartMangerClient>;

  const updateJobHandler = new UpdateJobHandler(
    jsLogger({ enabled: false }),
    configMock,
    taskBuilderMock,
    queueClientMock,
    catalogClientMock,
    seedingJobCreatorMock,
    polygonPartMangerClientMock
  );

  return {
    updateJobHandler,
    taskBuilderMock,
    queueClientMock,
    jobManagerClientMock,
    mapproxyClientMock,
    catalogClientMock,
    seedingJobCreatorMock,
    polygonPartMangerClientMock,
  };
};
