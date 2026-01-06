import { faker } from '@faker-js/faker';
import {
  ExportFinalizeTaskParams,
  ExportFinalizeType,
  IngestionNewFinalizeTaskParams,
  IngestionSwapUpdateFinalizeTaskParams,
  IngestionUpdateFinalizeTaskParams,
  TaskBlockDuplicationParam,
} from '@map-colonies/raster-shared';
import { ITaskResponse, OperationStatus } from '@map-colonies/mc-priority-queue';
import { ExportFinalizeTask, ExportInitTask } from '../../../src/utils/zod/schemas/job.schema';
import { exportJob, ingestionNewJob, ingestionSwapUpdateJob, ingestionUpdateJob } from './jobsMockData';

export const createFakeTask = <T>(taskOverride?: Partial<ITaskResponse<T>>, parameters?: T): ITaskResponse<T> => ({
  id: faker.string.uuid(),
  type: 'create-merge-tasks',
  description: faker.lorem.sentence({ min: 1, max: 3 }),
  parameters: parameters ?? ({} as T),
  status: OperationStatus.PENDING,
  percentage: 0,
  reason: '',
  attempts: 0,
  jobId: faker.string.uuid(),
  resettable: true,
  created: new Date().toISOString(),
  updated: new Date().toISOString(),
  ...taskOverride,
});

export const createMergeTasksTaskForIngestionNew = createFakeTask<TaskBlockDuplicationParam>(
  { jobId: ingestionNewJob.id, type: 'create-merge-tasks' },
  { blockDuplication: true }
);

export const createMergeTasksTaskForIngestionUpdate = createFakeTask<TaskBlockDuplicationParam>(
  { jobId: ingestionUpdateJob.id, type: 'create-merge-tasks' },
  { blockDuplication: true }
);

export const createMergeTasksTaskForIngestionSwapUpdate = createFakeTask<TaskBlockDuplicationParam>(
  { jobId: ingestionSwapUpdateJob.id, type: 'create-merge-tasks' },
  { blockDuplication: true }
);

export const initTaskForExport: ExportInitTask = createFakeTask<TaskBlockDuplicationParam>(
  { jobId: exportJob.id, type: 'init', status: OperationStatus.IN_PROGRESS },
  { blockDuplication: true }
);

export const finalizeTaskForExport: ExportFinalizeTask = createFakeTask<ExportFinalizeTaskParams>(
  { jobId: exportJob.id, type: 'finalize', status: OperationStatus.IN_PROGRESS },
  {
    type: ExportFinalizeType.Full_Processing,
    gpkgModified: false,
    gpkgUploadedToS3: false,
    callbacksSent: false,
  }
);

export const finalizeSuccessTaskForExport: ExportFinalizeTask = createFakeTask<ExportFinalizeTaskParams>(
  { jobId: exportJob.id, type: 'finalize', status: OperationStatus.IN_PROGRESS, percentage: 100, resettable: false },
  {
    type: ExportFinalizeType.Full_Processing,
    gpkgModified: false,
    gpkgUploadedToS3: false,
    callbacksSent: false,
  }
);

export const finalizeTaskForIngestionNew = createFakeTask<IngestionNewFinalizeTaskParams>(
  { jobId: ingestionNewJob.id, type: 'finalize', status: OperationStatus.IN_PROGRESS },
  {
    insertedToCatalog: false,
    insertedToGeoServer: false,
    insertedToMapproxy: false,
    processedParts: false,
  }
);

export const finalizeTaskForIngestionUpdate = createFakeTask<IngestionUpdateFinalizeTaskParams>(
  { jobId: ingestionUpdateJob.id, type: 'finalize', status: OperationStatus.IN_PROGRESS },
  {
    updatedInCatalog: false,
    processedParts: false,
  }
);

export const finalizeTaskForIngestionSwapUpdate = createFakeTask<IngestionSwapUpdateFinalizeTaskParams>(
  { jobId: ingestionSwapUpdateJob.id, type: 'finalize', status: OperationStatus.IN_PROGRESS },
  {
    updatedInCatalog: false,
    updatedInMapproxy: false,
    processedParts: false,
  }
);
