import { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import jsLogger from '@map-colonies/js-logger';
import { SeedingJobCreator } from '../../../../src/job/models/seedingJobCreator';
import { MapproxyApiClient } from '../../../../src/httpClients/mapproxyClient';
import { configMock } from '../../mocks/configMock';
import { PolygonPartMangerClient } from '../../../../src/httpClients/polygonPartMangerClient';

export interface SeedingJobCreatorTestContext {
  seedingJobCreator: SeedingJobCreator;
  queueClientMock: jest.Mocked<QueueClient>;
  jobManagerClientMock: jest.Mocked<JobManagerClient>;
  mapproxyClientMock: jest.Mocked<MapproxyApiClient>;
  configMock: typeof configMock;
  polygonPartsManagerClientMock: jest.Mocked<PolygonPartMangerClient>;
}

export const setupSeedingJobCreatorTest = (): SeedingJobCreatorTestContext => {
  const jobManagerClientMock = {
    createJob: jest.fn(),
  } as unknown as jest.Mocked<JobManagerClient>;

  const queueClientMock = {
    jobManagerClient: jobManagerClientMock,
  } as unknown as jest.Mocked<QueueClient>;

  const mapproxyClientMock = { getCacheName: jest.fn() } as unknown as jest.Mocked<MapproxyApiClient>;

  const polygonPartsManagerClientMock = { getAggregatedPartData: jest.fn() } as unknown as jest.Mocked<PolygonPartMangerClient>;

  const seedingJobCreator = new SeedingJobCreator(
    jsLogger({ enabled: false }),
    configMock,
    queueClientMock,
    mapproxyClientMock,
    polygonPartsManagerClientMock
  );

  return {
    seedingJobCreator,
    queueClientMock,
    jobManagerClientMock,
    mapproxyClientMock,
    configMock,
    polygonPartsManagerClientMock,
  };
};
