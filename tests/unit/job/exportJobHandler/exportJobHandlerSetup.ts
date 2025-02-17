import { IConfig } from 'config';
import jsLogger from '@map-colonies/js-logger';
import { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { ExportTaskManager } from '../../../../src/task/models/exportTaskManager';
import { CatalogClient } from '../../../../src/httpClients/catalogClient';
import { ExportJobHandler } from '../../../../src/job/models/export/exportJobHandler';
import { taskMetricsMock } from '../../mocks/metricsMock';
import { jobManagerClientMock, queueClientMock } from '../../mocks/jobManagerMocks';
import { tracerMock } from '../../mocks/tracerMock';
import { configMock } from '../../mocks/configMock';

export interface ExportJobHandlerTestContext {
  configMock: IConfig;
  exportJobHandler: ExportJobHandler;
  exportTaskManagerMock: jest.Mocked<ExportTaskManager>;
  queueClientMock: jest.Mocked<QueueClient>;
  jobManagerClientMock: jest.Mocked<JobManagerClient>;
  catalogClientMock: jest.Mocked<CatalogClient>;
}

export const setupExportJobHandlerTest = (): ExportJobHandlerTestContext => {
  const exportTaskManagerMock = {
    generateTileRangeBatches: jest.fn(),
    generateSources: jest.fn(),
  } as unknown as jest.Mocked<ExportTaskManager>;

  const catalogClientMock = { findLayer: jest.fn() } as unknown as jest.Mocked<CatalogClient>;

  const exportJobHandler = new ExportJobHandler(
    jsLogger({ enabled: false }),
    configMock,
    tracerMock,
    queueClientMock,
    catalogClientMock,
    exportTaskManagerMock,
    taskMetricsMock
  );

  return {
    exportJobHandler,
    exportTaskManagerMock,
    queueClientMock,
    jobManagerClientMock,
    catalogClientMock,
    configMock,
  };
};
