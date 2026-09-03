import type { Mocked, MockedFunction } from 'vitest';
import type { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { getTestLogger } from '../../../configurations/testLogger';
import { CacheDeletionJobCreator } from '../../../../src/job/models/ingestion/cacheDeletionJobCreator';
import type { MapproxyApiClient } from '../../../../src/httpClients/mapproxyClient';
import { configMock } from '../../mocks/configMock';
import { tracerMock } from '../../mocks/tracerMock';
import { readProductGeometryMock } from '../../mocks/productReaderMock';

export interface CacheDeletionJobCreatorTestContext {
  cacheDeletionJobCreator: CacheDeletionJobCreator;
  jobManagerClientMock: Mocked<JobManagerClient>;
  mapproxyClientMock: Mocked<MapproxyApiClient>;
  readProductGeometryMock: MockedFunction<typeof readProductGeometryMock>;
}

export const setupCacheDeletionJobCreatorTest = async (): Promise<CacheDeletionJobCreatorTestContext> => {
  const jobManagerClientMock = {
    createJob: vi.fn(),
    createTaskForJob: vi.fn(),
    updateJob: vi.fn(),
  } as unknown as Mocked<JobManagerClient>;

  const queueClientMock = {
    jobManagerClient: jobManagerClientMock,
  } as unknown as Mocked<QueueClient>;

  const mapproxyClientMock = { getRedisCache: vi.fn() } as unknown as Mocked<MapproxyApiClient>;

  const cacheDeletionJobCreator = new CacheDeletionJobCreator(
    await getTestLogger(),
    tracerMock,
    configMock,
    queueClientMock,
    mapproxyClientMock,
    readProductGeometryMock
  );

  return {
    cacheDeletionJobCreator,
    jobManagerClientMock,
    mapproxyClientMock,
    readProductGeometryMock,
  };
};
