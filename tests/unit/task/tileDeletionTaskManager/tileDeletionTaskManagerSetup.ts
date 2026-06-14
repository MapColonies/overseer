import type { Mocked } from 'vitest';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { TileRanger } from '@map-colonies/mc-utils';
import { getTestLogger } from '../../../configurations/testLogger';
import { configMock } from '../../mocks/configMock';
import type { JobManagerConfig } from '../../../../src/common/interfaces';
import { TileDeletionTaskManager } from '../../../../src/task/models/deletionTaskManager';
import { taskMetricsMock } from '../../mocks/metricsMock';
import { tracerMock } from '../../mocks/tracerMock';
import { queueClientMock } from '../../mocks/jobManagerMocks';
import type { PolygonPartsMangerClient } from '../../../../src/httpClients/polygonPartsMangerClient';

export const polygonPartsMangerClientMock = {
  getIntersection: vi.fn(),
} as unknown as Mocked<PolygonPartsMangerClient>;

export interface TileDeletionTaskManagerContext {
  tileDeletionTaskManager: TileDeletionTaskManager;
}

export function setupTileDeletionTaskManagerTest(useMockQueueClient = true): TileDeletionTaskManagerContext {
  const mockLogger = getTestLogger();

  const jobManagerConfig = configMock.get<JobManagerConfig>('jobManagement.config');

  const queueClientInstance = new QueueClient(
    mockLogger,
    jobManagerConfig.jobManagerBaseUrl,
    jobManagerConfig.heartbeat.baseUrl,
    jobManagerConfig.dequeueIntervalMs,
    jobManagerConfig.heartbeat.intervalMs
  );

  const queueClient = useMockQueueClient ? queueClientMock : queueClientInstance;

  const tileDeletionTaskManager = new TileDeletionTaskManager(
    mockLogger,
    tracerMock,
    configMock,
    queueClient,
    new TileRanger(),
    polygonPartsMangerClientMock,
    taskMetricsMock
  );

  return { tileDeletionTaskManager };
}
