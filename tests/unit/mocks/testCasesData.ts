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
  createTasksTaskForIngestionNew,
  createTasksTaskForIngestionSwapUpdate,
  createTasksTaskForIngestionUpdate,
} from '../mocks/tasksMockData';
import type { InstanceType } from '../../../src/utils/zod/schemas/instance.schema';

interface JobProcessingTestCase {
  jobType: string;
  taskType: string;
  job: IJobResponse<unknown, unknown>;
  task: ITaskResponse<unknown>;
  instanceType?: InstanceType;
}

export const createTasksTestCases: JobProcessingTestCase[] = [
  {
    jobType: ingestionNewJob.type,
    taskType: createTasksTaskForIngestionNew.type,
    job: ingestionNewJob,
    task: createTasksTaskForIngestionNew,
  },
  {
    jobType: ingestionUpdateJob.type,
    taskType: createTasksTaskForIngestionUpdate.type,
    job: ingestionUpdateJob,
    task: createTasksTaskForIngestionUpdate,
  },
  {
    jobType: ingestionSwapUpdateJob.type,
    taskType: createTasksTaskForIngestionSwapUpdate.type,
    job: ingestionSwapUpdateJob,
    task: createTasksTaskForIngestionSwapUpdate,
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
