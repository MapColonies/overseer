import { IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import { TaskBlockDuplicationParam } from '@map-colonies/raster-shared';
import {
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
  initTaskForIngestionNew,
  initTaskForIngestionSwapUpdate,
  initTaskForIngestionUpdate,
} from '../mocks/tasksMockData';

interface IngestionTestCase {
  jobType: string;
  taskType: string;
  job: IJobResponse<unknown, unknown>;
  task: ITaskResponse<TaskBlockDuplicationParam>;
}

export const initTestCases: IngestionTestCase[] = [
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
