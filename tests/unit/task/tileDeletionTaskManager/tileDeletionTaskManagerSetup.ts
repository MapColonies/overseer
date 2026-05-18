import jsLogger from '@map-colonies/js-logger';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { TileRanger } from '@map-colonies/mc-utils';
import { configMock } from '../../mocks/configMock';
import { JobManagerConfig } from '../../../../src/common/interfaces';
import { TileDeletionTaskManager } from '../../../../src/task/models/deletionTaskManager';
import { taskMetricsMock } from '../../mocks/metricsMock';
import { tracerMock } from '../../mocks/tracerMock';
import { jobManagerClientMock, queueClientMock } from '../../mocks/jobManagerMocks';
import { PolygonPartsMangerClient } from '../../../../src/httpClients/polygonPartsMangerClient';

export const polygonPartsMangerClientMock = {
  getIntersection: jest.fn(),
} as unknown as jest.Mocked<PolygonPartsMangerClient>;

export interface TileDeletionTaskManagerContext {
  tileDeletionTaskManager: TileDeletionTaskManager;
}

export function setupTileDeletionTaskManagerTest(useMockQueueClient = true): TileDeletionTaskManagerContext {
  const mockLogger = jsLogger({ enabled: false });

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
