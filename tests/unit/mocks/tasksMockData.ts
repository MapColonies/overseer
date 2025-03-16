import {
  IngestionNewFinalizeTaskParams,
  IngestionSwapUpdateFinalizeTaskParams,
  IngestionUpdateFinalizeTaskParams,
  TaskBlockDuplicationParam,
} from '@map-colonies/raster-shared';
import { ITaskResponse, OperationStatus } from '@map-colonies/mc-priority-queue';
import { ExportFinalizeTask, ExportInitTask } from '../../../src/utils/zod/schemas/job.schema';

export const initTaskForIngestionNew: ITaskResponse<TaskBlockDuplicationParam> = {
  id: '4a5486bd-6269-4898-b9b1-647fe56d6ae2',
  type: 'init',
  description: '',
  parameters: {
    blockDuplication: true,
  },
  status: OperationStatus.IN_PROGRESS,
  percentage: 0,
  reason: '',
  attempts: 0,
  jobId: 'de57d743-3155-4a28-86c8-9c181faabd94',
  resettable: true,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  created: '2024-07-21T10:59:23.510Z',
  updated: '2024-07-24T07:43:10.528Z',
};

export const initTaskForIngestionUpdate: ITaskResponse<TaskBlockDuplicationParam> = {
  id: 'c3f42c71-8324-4103-86ca-8f043645fdb8',
  type: 'init',
  description: '',
  parameters: {
    blockDuplication: true,
  },
  status: OperationStatus.IN_PROGRESS,
  percentage: 0,
  reason: '',
  attempts: 0,
  jobId: 'd027b3aa-272b-4dc9-91d7-ba8343af5ed1',
  resettable: true,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  created: '2024-07-21T10:59:23.510Z',
  updated: '2024-07-24T07:43:10.528Z',
};

export const initTaskForIngestionSwapUpdate: ITaskResponse<TaskBlockDuplicationParam> = {
  id: '018ccf1d-1adb-4c9e-8d80-1b311c6ad41f',
  type: 'init',
  description: '',
  parameters: {
    blockDuplication: true,
  },
  status: OperationStatus.IN_PROGRESS,
  percentage: 0,
  reason: '',
  attempts: 0,
  jobId: 'c023b3ba-272b-4dc9-92d7-ba8343af5ed9',
  resettable: true,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  created: '2024-07-21T10:59:23.510Z',
  updated: '2024-07-24T07:43:10.528Z',
};

export const initTaskForExport: ExportInitTask = {
  id: 'f336287d-7c9f-4237-b864-c96cf7b28aa0',
  type: 'init',
  description: '',
  parameters: {
    blockDuplication: true,
  },
  status: OperationStatus.IN_PROGRESS,
  percentage: 0,
  reason: '',
  attempts: 0,
  jobId: 'd78516d4-d815-4e0b-a8bd-88e0c434c928',
  resettable: true,
  created: '2025-02-13T09:38:26.043Z',
  updated: '2025-02-13T11:31:52.154Z',
};

export const finalizeTaskForExport: ExportFinalizeTask = {
  id: 'f336287d-7c9f-4237-b864-c96cf7b28aa0',
  type: 'finalize',
  description: '',
  parameters: {
    status: OperationStatus.COMPLETED,
    gpkgModified: false,
    gpkgUploadedToS3: false,
    callbacksSent: false,
  },
  status: OperationStatus.IN_PROGRESS,
  percentage: 0,
  reason: '',
  attempts: 0,
  jobId: 'd78516d4-d815-4e0b-a8bd-88e0c434c928',
  resettable: true,
  created: '2025-02-13T09:38:26.043Z',
  updated: '2025-02-13T11:31:52.154Z',
};

export const finalizeTaskForIngestionNew: ITaskResponse<IngestionNewFinalizeTaskParams> = {
  id: '4a5486bd-6269-4898-b9b1-647fe56d6ae2',
  type: 'finalize',
  description: '',
  parameters: {
    insertedToCatalog: false,
    insertedToGeoServer: false,
    insertedToMapproxy: false,
  },
  status: OperationStatus.IN_PROGRESS,
  percentage: 0,
  reason: '',
  attempts: 0,
  jobId: 'de57d743-3155-4a28-86c8-9c181faabd94',
  resettable: true,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  created: '2024-07-21T10:59:23.510Z',
  updated: '2024-07-24T07:43:10.528Z',
};

export const finalizeTaskForIngestionUpdate: ITaskResponse<IngestionUpdateFinalizeTaskParams> = {
  id: 'c3f42c71-8324-4103-86ca-8f043645fdb8',
  type: 'finalize',
  description: '',
  parameters: {
    updatedInCatalog: false,
  },
  status: OperationStatus.IN_PROGRESS,
  percentage: 0,
  reason: '',
  attempts: 0,
  jobId: 'd027b3aa-272b-4dc9-91d7-ba8343af5ed1',
  resettable: true,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  created: '2024-07-21T10:59:23.510Z',
  updated: '2024-07-24T07:43:10.528Z',
};

export const finalizeTaskForIngestionSwapUpdate: ITaskResponse<IngestionSwapUpdateFinalizeTaskParams> = {
  id: '018ccf1d-1adb-4c9e-8d80-1b311c6ad41f',
  type: 'finalize',
  description: '',
  parameters: {
    updatedInCatalog: false,
    updatedInMapproxy: false,
  },
  status: OperationStatus.IN_PROGRESS,
  percentage: 0,
  reason: '',
  attempts: 0,
  jobId: 'c023b3ba-272b-4dc9-92d7-ba8343af5ed9',
  resettable: true,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  created: '2024-07-21T10:59:23.510Z',
  updated: '2024-07-24T07:43:10.528Z',
};
