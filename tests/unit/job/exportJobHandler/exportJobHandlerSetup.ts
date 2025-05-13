import { IConfig } from 'config';
import jsLogger from '@map-colonies/js-logger';
import { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { ExportTaskManager } from '../../../../src/task/models/exportTaskManager';
import { CatalogClient } from '../../../../src/httpClients/catalogClient';
import { ExportJobHandler } from '../../../../src/job/models/export/exportJobHandler';
import { taskMetricsMock } from '../../mocks/metricsMock';
import { jobManagerClientMock, jobTrackerClientMock, queueClientMock } from '../../mocks/jobManagerMocks';
import { tracerMock } from '../../mocks/tracerMock';
import { configMock } from '../../mocks/configMock';
import { S3Service } from '../../../../src/utils/storage/s3Service';
import { FSService } from '../../../../src/utils/storage/fsService';
import { CallbackClient } from '../../../../src/httpClients/callbackClient';
import { JobTrackerClient } from '../../../../src/httpClients/jobTrackerClient';
import { PolygonPartsMangerClient } from '../../../../src/httpClients/polygonPartsMangerClient';

export interface ExportJobHandlerTestContext {
  configMock: IConfig;
  exportJobHandler: ExportJobHandler;
  exportTaskManagerMock: jest.Mocked<ExportTaskManager>;
  queueClientMock: jest.Mocked<QueueClient>;
  jobManagerClientMock: jest.Mocked<JobManagerClient>;
  catalogClientMock: jest.Mocked<CatalogClient>;
  s3ServiceMock: jest.Mocked<S3Service>;
  fsServiceMock: jest.Mocked<FSService>;
  callbackClientMock: jest.Mocked<CallbackClient>;
  jobTrackerClientMock: jest.Mocked<JobTrackerClient>;
  polygonPartsManagerClientMock: jest.Mocked<PolygonPartsMangerClient>;
}

export const setupExportJobHandlerTest = (): ExportJobHandlerTestContext => {
  const exportTaskManagerMock = {
    generateTileRangeBatches: jest.fn(),
    generateSources: jest.fn(),
  } as unknown as jest.Mocked<ExportTaskManager>;

  const catalogClientMock = { findLayer: jest.fn() } as unknown as jest.Mocked<CatalogClient>;

  const s3ServiceMock = {
    uploadFiles: jest.fn(),
  } as unknown as jest.Mocked<S3Service>;

  const fsServiceMock = {
    deleteFile: jest.fn(),
    deleteDirectory: jest.fn(),
    deleteFileAndParentDir: jest.fn(),
    getFileSize: jest.fn(),
    uploadJsonFile: jest.fn(),
    calculateFileSha256: jest.fn(),
  } as unknown as jest.Mocked<FSService>;

  const callbackClientMock = {
    send: jest.fn(),
  } as unknown as jest.Mocked<CallbackClient>;

  const polygonPartsManagerClientMock = {
    getAggregatedLayerMetadata: jest.fn(),
  } as unknown as jest.Mocked<PolygonPartsMangerClient>;

  const exportJobHandler = new ExportJobHandler(
    jsLogger({ enabled: false }),
    configMock,
    tracerMock,
    queueClientMock,
    jobTrackerClientMock,
    catalogClientMock,
    exportTaskManagerMock,
    s3ServiceMock,
    fsServiceMock,
    callbackClientMock,
    taskMetricsMock,
    polygonPartsManagerClientMock
  );

  return {
    exportJobHandler,
    exportTaskManagerMock,
    queueClientMock,
    jobManagerClientMock,
    catalogClientMock,
    configMock,
    s3ServiceMock,
    fsServiceMock,
    callbackClientMock,
    jobTrackerClientMock,
    polygonPartsManagerClientMock,
  };
};
