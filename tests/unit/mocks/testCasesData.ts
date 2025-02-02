import { IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import { ingestionNewJob, ingestionNewJobExtended, ingestionUpdateJob } from '../mocks/jobsMockData';
import {
  finalizeTaskForIngestionNew,
  finalizeTaskForIngestionSwapUpdate,
  finalizeTaskForIngestionUpdate,
  initTaskForIngestionNew,
  initTaskForIngestionUpdate,
  IPollingTaskParameters,
} from '../mocks/tasksMockData';

interface IngestionTestCase {
  jobType: string;
  taskType: string;
  job: IJobResponse<unknown, unknown>;
  task: ITaskResponse<IPollingTaskParameters>;
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
    jobType: ingestionUpdateJob.type,
    taskType: initTaskForIngestionNew.type,
    job: ingestionUpdateJob,
    task: initTaskForIngestionUpdate,
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
    jobType: ingestionUpdateJob.type,
    taskType: finalizeTaskForIngestionUpdate.type,
    job: ingestionUpdateJob,
    task: finalizeTaskForIngestionUpdate,
  },
  {
    jobType: ingestionUpdateJob.type,
    taskType: finalizeTaskForIngestionSwapUpdate.type,
    job: ingestionUpdateJob,
    task: finalizeTaskForIngestionSwapUpdate,
  },
];
