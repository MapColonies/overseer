import type { Mocked } from 'vitest';
import type { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import type { IConfig } from '../../../../src/common/interfaces';
import { getTestLogger } from '../../../configurations/testLogger';
import type { ExportTaskManager } from '../../../../src/task/models/exportTaskManager';
import type { CatalogClient } from '../../../../src/httpClients/catalogClient';
import { ExportJobHandler } from '../../../../src/job/models/export/exportJobHandler';
import { taskMetricsMock } from '../../mocks/metricsMock';
import { jobManagerClientMock, jobTrackerClientMock, queueClientMock } from '../../mocks/jobManagerMocks';
import { tracerMock } from '../../mocks/tracerMock';
import { configMock } from '../../mocks/configMock';
import type { S3Service } from '../../../../src/utils/storage/s3Service';
import type { FSService } from '../../../../src/utils/storage/fsService';
import type { CallbackClient } from '../../../../src/httpClients/callbackClient';
import type { JobTrackerClient } from '../../../../src/httpClients/jobTrackerClient';
import type { PolygonPartsMangerClient } from '../../../../src/httpClients/polygonPartsMangerClient';
import { ArtifactPathBuilder } from '../../../../src/utils/storage/artifactPathBuilder';

export interface ExportJobHandlerTestContext {
  configMock: IConfig;
  exportJobHandler: ExportJobHandler;
  exportTaskManagerMock: Mocked<ExportTaskManager>;
  queueClientMock: Mocked<QueueClient>;
  jobManagerClientMock: Mocked<JobManagerClient>;
  catalogClientMock: Mocked<CatalogClient>;
  s3ServiceMock: Mocked<S3Service>;
  fsServiceMock: Mocked<FSService>;
  callbackClientMock: Mocked<CallbackClient>;
  jobTrackerClientMock: Mocked<JobTrackerClient>;
  polygonPartsManagerClientMock: Mocked<PolygonPartsMangerClient>;
}

export const setupExportJobHandlerTest = (): ExportJobHandlerTestContext => {
  const exportTaskManagerMock = {
    generateTileRangeBatches: vi.fn(),
    generateSources: vi.fn(),
  } as unknown as Mocked<ExportTaskManager>;

  const catalogClientMock = { findLayer: vi.fn() } as unknown as Mocked<CatalogClient>;

  const s3ServiceMock = {
    uploadFiles: vi.fn(),
  } as unknown as Mocked<S3Service>;

  const fsServiceMock = {
    deleteFile: vi.fn(),
    deleteDirectory: vi.fn(),
    deleteFileAndParentDir: vi.fn(),
    getFileSize: vi.fn(),
    uploadJsonFile: vi.fn(),
    calculateFileSha256: vi.fn(),
  } as unknown as Mocked<FSService>;

  const callbackClientMock = {
    send: vi.fn(),
  } as unknown as Mocked<CallbackClient>;

  const polygonPartsManagerClientMock = {
    getAggregatedLayerMetadata: vi.fn(),
  } as unknown as Mocked<PolygonPartsMangerClient>;

  const pathBuilder = new ArtifactPathBuilder(configMock);

  const exportJobHandler = new ExportJobHandler(
    await getTestLogger(),
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
    polygonPartsManagerClientMock,
    pathBuilder
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
