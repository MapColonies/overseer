import { IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import { TaskBlockDuplicationParam } from '@map-colonies/raster-shared';
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
  finalizeTaskForIngestionNew,
  finalizeTaskForIngestionSwapUpdate,
  finalizeTaskForIngestionUpdate,
  initTaskForExport,
  initTaskForIngestionNew,
  initTaskForIngestionSwapUpdate,
  initTaskForIngestionUpdate,
} from '../mocks/tasksMockData';

interface InitTestCase {
  jobType: string;
  taskType: string;
  job: IJobResponse<unknown, unknown>;
  task: ITaskResponse<TaskBlockDuplicationParam>;
}

export const initTestCases: InitTestCase[] = [
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
  },
];
export const finalizeTestCases = [
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
];
