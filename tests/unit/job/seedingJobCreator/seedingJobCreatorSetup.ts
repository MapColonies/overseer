import { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import jsLogger from '@map-colonies/js-logger';
import { SeedingJobCreator } from '../../../../src/job/models/ingestion/seedingJobCreator';
import { MapproxyApiClient } from '../../../../src/httpClients/mapproxyClient';
import { configMock } from '../../mocks/configMock';
import { SeedJobParams } from '../../../../src/common/interfaces';
import { SeedMode } from '../../../../src/common/constants';
import { ingestionUpdateFinalizeJob } from '../../mocks/jobsMockData';
import { tracerMock } from '../../mocks/tracerMock';

export interface SeedingJobCreatorTestContext {
  seedingJobCreator: SeedingJobCreator;
  queueClientMock: jest.Mocked<QueueClient>;
  jobManagerClientMock: jest.Mocked<JobManagerClient>;
  mapproxyClientMock: jest.Mocked<MapproxyApiClient>;
  configMock: typeof configMock;
}

export const setupSeedingJobCreatorTest = (): SeedingJobCreatorTestContext => {
  const jobManagerClientMock = {
    createJob: jest.fn(),
  } as unknown as jest.Mocked<JobManagerClient>;

  const queueClientMock = {
    jobManagerClient: jobManagerClientMock,
  } as unknown as jest.Mocked<QueueClient>;

  const mapproxyClientMock = { getCacheName: jest.fn() } as unknown as jest.Mocked<MapproxyApiClient>;

  const seedingJobCreator = new SeedingJobCreator(jsLogger({ enabled: false }), tracerMock, configMock, queueClientMock, mapproxyClientMock);

  return {
    seedingJobCreator,
    queueClientMock,
    jobManagerClientMock,
    mapproxyClientMock,
    configMock,
  };
};

export const seedJobParameters: SeedJobParams = {
  mode: SeedMode.SEED,
  layerName: 'layer-Orthophoto',
  ingestionJob: ingestionUpdateFinalizeJob,
};
