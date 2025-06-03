import jsLogger from '@map-colonies/js-logger';
import { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { container } from 'tsyringe';
import { INJECTION_VALUES, SERVICES } from '../../../../src/common/constants';
import { CatalogClient } from '../../../../src/httpClients/catalogClient';
import { JobTrackerClient } from '../../../../src/httpClients/jobTrackerClient';
import { MapproxyApiClient } from '../../../../src/httpClients/mapproxyClient';
import { SeedingJobCreator } from '../../../../src/job/models/ingestion/seedingJobCreator';
import { UpdateJobHandler } from '../../../../src/job/models/ingestion/updateJobHandler';
import { TileMergeTaskManager } from '../../../../src/task/models/tileMergeTaskManager';
import { type IngestionJobTypes } from '../../../../src/utils/configUtil';
import { TaskMetrics } from '../../../../src/utils/metrics/taskMetrics';
import { configMock } from '../../mocks/configMock';
import { jobManagerClientMock, jobTrackerClientMock, queueClientMock } from '../../mocks/jobManagerMocks';
import { taskMetricsMock } from '../../mocks/metricsMock';
import { tracerMock } from '../../mocks/tracerMock';

export interface UpdateJobHandlerTestContext {
  updateJobHandler: UpdateJobHandler;
  taskBuilderMock: jest.Mocked<TileMergeTaskManager>;
  queueClientMock: jest.MockedObjectDeep<QueueClient>;
  jobManagerClientMock: jest.Mocked<JobManagerClient>;
  mapproxyClientMock: jest.Mocked<MapproxyApiClient>;
  catalogClientMock: jest.Mocked<CatalogClient>;
  seedingJobCreatorMock: jest.Mocked<SeedingJobCreator>;
  jobTrackerClientMock: jest.Mocked<JobTrackerClient>;
}

export const setupUpdateJobHandlerTest = (): UpdateJobHandlerTestContext => {
  const taskBuilderMock = {
    buildTasks: jest.fn(),
    pushTasks: jest.fn(),
    buildLowResolutionTasks: jest.fn(),
  } as unknown as jest.Mocked<TileMergeTaskManager>;

  const mapproxyClientMock = { publish: jest.fn() } as unknown as jest.Mocked<MapproxyApiClient>;
  const catalogClientMock = { publish: jest.fn(), update: jest.fn() } as unknown as jest.Mocked<CatalogClient>;
  const seedingJobCreatorMock = { create: jest.fn() } as unknown as jest.Mocked<SeedingJobCreator>;

  const handlersTokens = {
    /* eslint-disable @typescript-eslint/naming-convention */
    Export: 'Export',
    Ingestion_New: 'Ingestion_New',
    Ingestion_Swap_Update: 'Ingestion_Swap_Update',
    Ingestion_Update: 'Ingestion_Update',
    /* eslint-enable @typescript-eslint/naming-convention */
  } satisfies IngestionJobTypes;
  container.register<IngestionJobTypes>(INJECTION_VALUES.ingestionJobTypes, {
    useValue: handlersTokens,
  });

  container.register(SERVICES.CONFIG, { useValue: configMock });
  container.register(SERVICES.LOGGER, { useValue: jsLogger({ enabled: false }) });
  container.register(SERVICES.TRACER, { useValue: tracerMock });
  container.register(TileMergeTaskManager, { useValue: taskBuilderMock });
  container.register(SERVICES.QUEUE_CLIENT, { useValue: queueClientMock });
  container.register(CatalogClient, { useValue: catalogClientMock });
  container.register(SeedingJobCreator, { useValue: seedingJobCreatorMock });
  container.register(JobTrackerClient, { useValue: jobTrackerClientMock });
  container.register(INJECTION_VALUES.ingestionJobTypes, { useValue: handlersTokens });
  container.register(TaskMetrics, { useValue: taskMetricsMock });
  container.register(handlersTokens.Ingestion_Update, { useClass: UpdateJobHandler });
  const updateJobHandler = container.resolve<UpdateJobHandler>(handlersTokens.Ingestion_Update);

  return {
    updateJobHandler,
    taskBuilderMock,
    queueClientMock,
    jobManagerClientMock,
    mapproxyClientMock,
    catalogClientMock,
    seedingJobCreatorMock,
    jobTrackerClientMock,
  };
};
