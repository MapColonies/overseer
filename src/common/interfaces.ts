import { IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import { InputFiles, NewRasterLayerMetadata, PolygonPart, TileOutputFormat } from '@map-colonies/mc-model-types';
import { TilesMimeFormat } from '@map-colonies/types';
import { BBox, Polygon } from 'geojson';
import { Footprint, ITileRange } from '@map-colonies/mc-utils';

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
  maxTaskAttempts: number;
}
//#endregion config

export interface IJobHandler {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleJobInit: (job: IJobResponse<any, any>, taskId: string) => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleJobFinalize: (job: IJobResponse<any, any>, taskId: string) => Promise<void>;
}

export interface JobAndTaskResponse {
  job: IJobResponse<unknown, unknown>;
  task: ITaskResponse<unknown>;
}

export type TaskResponse<T> = { task: ITaskResponse<T>; shouldSkipTask: false } | { task: null; shouldSkipTask: true };

export interface ExtendedRasterLayerMetadata extends NewRasterLayerMetadata {
  catalogId: string;
  displayPath: string;
  layerRelativePath: string;
  tileOutputFormat: TileOutputFormat;
  tileMimeType: TilesMimeFormat | undefined;
  grid: Grid;
}

export interface MergeTilesTaskParams {
  inputFiles: InputFiles;
  taskMetadata: MergeTilesMetadata;
  partsData: PolygonPart[];
}

export interface MergeTilesMetadata {
  layerRelativePath: string;
  tileOutputFormat: TileOutputFormat;
  isNewTarget: boolean;
  grid: Grid;
}

export enum Grid {
  TWO_ON_ONE = '2x1',
}
//#region task
export interface IPartSourceContext {
  fileName: string;
  tilesPath: string;
  footprint: Polygon;
  extent: BBox;
  maxZoom: number;
}

export interface IMergeParameters {
  parts: IPartSourceContext[];
  destPath: string;
  maxZoom: number;
  grid: Grid;
  targetFormat: TileOutputFormat;
  isNewTarget: boolean;
}

export interface IMergeSources {
  type: string;
  path: string;
  grid?: Grid;
  extent?: IBBox;
}

export interface IMergeTaskParameters {
  targetFormat: TileOutputFormat;
  isNewTarget: boolean;
  sources: IMergeSources[];
  batches: ITileRange[];
}

export interface IPartsIntersection {
  parts: IPartSourceContext[];
  intersection: Footprint;
}

export interface IntersectionState {
  accumulatedIntersection: Footprint | null;
  currentIntersection: Footprint | null;
}
//#endregion task

export interface IBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
