import { IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import {
  exportJob,
  ingestionNewJob,
  ingestionNewJobExtended,
  ingestionSwapUpdateFinalizeJob,
  ingestionSwapUpdateJob,
  ingestionUpdateFinalizeJob,
  ingestionUpdateJob,
} from '../mocks/jobsMockData';
import {
  finalizeTaskForExport,
  finalizeTaskForIngestionNew,
  finalizeTaskForIngestionSwapUpdate,
  finalizeTaskForIngestionUpdate,
  initTaskForExport,
  initTaskForIngestionNew,
  initTaskForIngestionSwapUpdate,
  initTaskForIngestionUpdate,
} from '../mocks/tasksMockData';
import type { InstanceType } from '../../../src/utils/zod/schemas/instance.schema';

interface JobProcessingTestCase {
  jobType: string;
  taskType: string;
  job: IJobResponse<unknown, unknown>;
  task: ITaskResponse<unknown>;
  instanceType?: InstanceType;
}

export const initTestCases: JobProcessingTestCase[] = [
  {
    jobType: ingestionNewJob.type,
    taskType: initTaskForIngestionNew.type,
    job: ingestionNewJob,
    task: initTaskForIngestionNew,
  },
  {
    jobType: ingestionUpdateJob.type,
    taskType: initTaskForIngestionNew.type,
    job: ingestionUpdateJob,
    task: initTaskForIngestionUpdate,
  },
  {
    jobType: ingestionSwapUpdateJob.type,
    taskType: initTaskForIngestionSwapUpdate.type,
    job: ingestionSwapUpdateJob,
    task: initTaskForIngestionSwapUpdate,
  },
  {
    jobType: exportJob.type,
    job: exportJob,
    taskType: initTaskForExport.type,
    task: initTaskForExport,
    instanceType: 'export',
  },
];
export const finalizeTestCases: JobProcessingTestCase[] = [
  {
    jobType: ingestionNewJob.type,
    taskType: finalizeTaskForIngestionNew.type,
    job: ingestionNewJobExtended,
    task: finalizeTaskForIngestionNew,
  },
  {
    jobType: ingestionUpdateFinalizeJob.type,
    taskType: finalizeTaskForIngestionUpdate.type,
    job: ingestionUpdateFinalizeJob,
    task: finalizeTaskForIngestionUpdate,
  },
  {
    jobType: ingestionSwapUpdateFinalizeJob.type,
    taskType: finalizeTaskForIngestionSwapUpdate.type,
    job: ingestionSwapUpdateFinalizeJob,
    task: finalizeTaskForIngestionSwapUpdate,
  },
  {
    jobType: exportJob.type,
    job: exportJob,
    taskType: finalizeTaskForExport.type,
    task: finalizeTaskForExport,
    instanceType: 'export',
  },
];
