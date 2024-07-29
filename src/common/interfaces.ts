import { IJobResponse } from '@map-colonies/mc-priority-queue';

//#region config interfaces
export interface IConfig {
  get: <T>(setting: string) => T;
  has: (setting: string) => boolean;
}

export interface IHeartbeatConfig {
  baseUrl: string;
  intervalMs: number;
}

export interface IJobManagerConfig {
  jobManagerBaseUrl: string;
  heartbeat: IHeartbeatConfig;
  dequeueIntervalMs: number;
}

export interface ITaskConfig {
  [key: string]: string;
}

export interface IJobConfig {
  type: string;
  tasks: ITaskConfig;
}

export interface IngestionJobsConfig {
  [key: string]: IJobConfig | undefined;
  new: IJobConfig | undefined;
  update: IJobConfig | undefined;
  swapUpdate: IJobConfig | undefined;
}

export interface IPollingTasks {
  init: string;
  finalize: string;
}

export interface IngestionConfig {
  pollingTasks: IPollingTasks;
  jobs: IngestionJobsConfig;
}
//#endregion config
export interface LogContext {
  fileName: string;
  class?: string;
  function?: string;
}
export interface IJobHandler {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleJobInit: (job: IJobResponse<any, any>) => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleJobFinalize: (job: IJobResponse<any, any>) => Promise<void>;
}

export interface JobAndTaskType {
  job: IJobResponse<unknown, unknown>;
  taskType: string;
}
