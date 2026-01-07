import { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import jsLogger from '@map-colonies/js-logger';
import { SeedingJobCreator } from '../../../../src/job/models/ingestion/seedingJobCreator';
import { MapproxyApiClient } from '../../../../src/httpClients/mapproxyClient';
import { configMock } from '../../mocks/configMock';
import { SeedJobParams } from '../../../../src/common/interfaces';
import { ingestionUpdateFinalizeJob } from '../../mocks/jobsMockData';
import { tracerMock } from '../../mocks/tracerMock';
import { readProductGeometry } from '../../mocks/productReaderMock';
import { CatalogClient } from '../../../../src/httpClients/catalogClient';

export interface SeedingJobCreatorTestContext {
  seedingJobCreator: SeedingJobCreator;
  queueClientMock: jest.Mocked<QueueClient>;
  jobManagerClientMock: jest.Mocked<JobManagerClient>;
  mapproxyClientMock: jest.Mocked<MapproxyApiClient>;
  configMock: typeof configMock;
  readProductGeometry: jest.MockedFunction<typeof readProductGeometry>;
}

export const setupSeedingJobCreatorTest = (): SeedingJobCreatorTestContext => {
  const jobManagerClientMock = {
    createJob: jest.fn(),
  } as unknown as jest.Mocked<JobManagerClient>;

  const queueClientMock = {
    jobManagerClient: jobManagerClientMock,
  } as unknown as jest.Mocked<QueueClient>;

  const mapproxyClientMock = { getCacheName: jest.fn() } as unknown as jest.Mocked<MapproxyApiClient>;
  const catalogClientMock = { update: jest.fn() } as unknown as jest.Mocked<CatalogClient>;

  const seedingJobCreator = new SeedingJobCreator(
    jsLogger({ enabled: false }),
    tracerMock,
    configMock,
    queueClientMock,
    mapproxyClientMock,
    readProductGeometry,
    catalogClientMock
  );

  return {
    seedingJobCreator,
    queueClientMock,
    jobManagerClientMock,
    mapproxyClientMock,
    configMock,
    readProductGeometry,
  };
};

export const seedJobParameters: SeedJobParams = {
  layerName: 'layer-Orthophoto',
  ingestionJob: ingestionUpdateFinalizeJob,
};
