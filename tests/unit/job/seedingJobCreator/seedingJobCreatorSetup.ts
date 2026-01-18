import { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import jsLogger from '@map-colonies/js-logger';
import { SeedingJobCreator } from '../../../../src/job/models/ingestion/seedingJobCreator';
import { MapproxyApiClient } from '../../../../src/httpClients/mapproxyClient';
import { configMock } from '../../mocks/configMock';
import { SeedJobParams } from '../../../../src/common/interfaces';
import { ingestionUpdateFinalizeJob } from '../../mocks/jobsMockData';
import { tracerMock } from '../../mocks/tracerMock';
import { readProductGeometryMock } from '../../mocks/productReaderMock';
import { CatalogClient } from '../../../../src/httpClients/catalogClient';

export interface SeedingJobCreatorTestContext {
  seedingJobCreator: SeedingJobCreator;
  queueClientMock: jest.Mocked<QueueClient>;
  jobManagerClientMock: jest.Mocked<JobManagerClient>;
  mapproxyClientMock: jest.Mocked<MapproxyApiClient>;
  configMock: typeof configMock;
  readProductGeometryMock: jest.MockedFunction<typeof readProductGeometryMock>;
  catalogClientMock: jest.Mocked<CatalogClient>;
}

export const setupSeedingJobCreatorTest = (): SeedingJobCreatorTestContext => {
  const jobManagerClientMock = {
    createJob: jest.fn(),
  } as unknown as jest.Mocked<JobManagerClient>;

  const queueClientMock = {
    jobManagerClient: jobManagerClientMock,
  } as unknown as jest.Mocked<QueueClient>;

  const mapproxyClientMock = { getCacheName: jest.fn() } as unknown as jest.Mocked<MapproxyApiClient>;
  const catalogClientMock = { update: jest.fn(), findLayer: jest.fn() } as unknown as jest.Mocked<CatalogClient>;

  const seedingJobCreator = new SeedingJobCreator(
    jsLogger({ enabled: false }),
    tracerMock,
    configMock,
    queueClientMock,
    mapproxyClientMock,
    readProductGeometryMock,
    catalogClientMock
  );

  return {
    seedingJobCreator,
    queueClientMock,
    jobManagerClientMock,
    mapproxyClientMock,
    configMock,
    readProductGeometryMock,
    catalogClientMock,
  };
};

export const seedJobParameters: SeedJobParams = {
  layerName: 'layer-Orthophoto',
  ingestionJob: ingestionUpdateFinalizeJob,
};
