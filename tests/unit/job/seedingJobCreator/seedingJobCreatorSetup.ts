import type { Mocked, MockedFunction } from 'vitest';
import type { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { getTestLogger } from '../../../configurations/testLogger';
import { SeedingJobCreator } from '../../../../src/job/models/ingestion/seedingJobCreator';
import type { MapproxyApiClient } from '../../../../src/httpClients/mapproxyClient';
import { configMock } from '../../mocks/configMock';
import type { SeedJobParams } from '../../../../src/common/interfaces';
import { ingestionUpdateFinalizeJob } from '../../mocks/jobsMockData';
import { tracerMock } from '../../mocks/tracerMock';
import { readProductGeometryMock } from '../../mocks/productReaderMock';
import type { CatalogClient } from '../../../../src/httpClients/catalogClient';

export interface SeedingJobCreatorTestContext {
  seedingJobCreator: SeedingJobCreator;
  queueClientMock: Mocked<QueueClient>;
  jobManagerClientMock: Mocked<JobManagerClient>;
  mapproxyClientMock: Mocked<MapproxyApiClient>;
  configMock: typeof configMock;
  readProductGeometryMock: MockedFunction<typeof readProductGeometryMock>;
  catalogClientMock: Mocked<CatalogClient>;
}

export const setupSeedingJobCreatorTest = async (): Promise<SeedingJobCreatorTestContext> => {
  const jobManagerClientMock = {
    createJob: vi.fn(),
  } as unknown as Mocked<JobManagerClient>;

  const queueClientMock = {
    jobManagerClient: jobManagerClientMock,
  } as unknown as Mocked<QueueClient>;

  const mapproxyClientMock = { getRedisCacheName: vi.fn() } as unknown as Mocked<MapproxyApiClient>;
  const catalogClientMock = { update: vi.fn(), findLayer: vi.fn() } as unknown as Mocked<CatalogClient>;

  const seedingJobCreator = new SeedingJobCreator(
    await getTestLogger(),
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
