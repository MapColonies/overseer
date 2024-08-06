import { ingestionNewJob, ingestionUpdateJob } from '../mocks/jobsMockData';
import {
  finalizeTaskForIngestionNew,
  finalizeTaskForIngestionSwapUpdate,
  finalizeTaskForIngestionUpdate,
  initTaskForIngestionNew,
  initTaskForIngestionUpdate,
} from '../mocks/tasksMockData';

export const initTestCases = [
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
    job: ingestionNewJob,
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
