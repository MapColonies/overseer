import { NewRasterLayer, UpdateRasterLayer } from '@map-colonies/mc-model-types';
import { IJobResponse } from '@map-colonies/mc-priority-queue';

export interface IConfig {
  get: <T>(setting: string) => T;
  has: (setting: string) => boolean;
}

export interface IQueueConfig {
  jobManagerBaseUrl: string;
  heartbeat: IHeartbeatConfig;
  dequeueIntervalMs: number;
  jobTypes: string[];
  initTaskType: string;
}

export interface IHeartbeatConfig {
  baseUrl: string;
  intervalMs: number;
}

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
  handle: (job: IJobResponse<any, any>) => Promise<void>;
}
