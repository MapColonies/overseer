import { NewRasterLayer, UpdateRasterLayer } from '@map-colonies/mc-model-types';
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

export interface IngestionConfig {
  init: {
    taskType: string;
  };
  jobs: IngestionJobsConfig;
}
//#endregion config interfaces
export interface LogContext {
  fileName: string;
  class?: string;
  function?: string;
}

/* eslint-disable @typescript-eslint/naming-convention */
export interface JobTypeMap {
  Ingestion_New: NewRasterLayer;
  Ingestion_Update: UpdateRasterLayer;
  Ingestion_Swap_Update: UpdateRasterLayer;
}
/* eslint-disable @typescript-eslint/naming-convention */

export interface IJobHandler {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleJob: (job: IJobResponse<any, any>) => Promise<void>;
}
