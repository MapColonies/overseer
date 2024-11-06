import { IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import {
  InputFiles,
  NewRasterLayerMetadata,
  PolygonPart,
  TileOutputFormat,
  LayerData,
  LayerMetadata,
  IngestionNewFinalizeTaskParams,
  IngestionUpdateFinalizeTaskParams,
  IngestionSwapUpdateFinalizeTaskParams,
} from '@map-colonies/mc-model-types';
import { TilesMimeFormat } from '@map-colonies/types';
import { BBox, Polygon } from 'geojson';
import { Footprint, ITileRange } from '@map-colonies/mc-utils';
import { PublishedLayerCacheType, SeedMode } from './constants';

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

export interface ITilesSeedingTaskConfig {
  type: string;
  grid: string;
  maxZoom: number;
  skipUncached: boolean;
}
//#endregion config

//#region job/task interfaces
export interface IJobHandler {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleJobInit: (job: IJobResponse<any, any>, taskId: string) => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleJobFinalize: (job: IJobResponse<any, any>, task: ITaskResponse<any>) => Promise<void>;
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

export type ExtendedNewRasterLayer = { metadata: ExtendedRasterLayerMetadata } & LayerData;

export type FinalizeTaskParams = IngestionNewFinalizeTaskParams | IngestionUpdateFinalizeTaskParams | IngestionSwapUpdateFinalizeTaskParams;

//#endregion job/task

//#region merge task

export enum Grid {
  TWO_ON_ONE = '2x1',
}

export interface IBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
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
//#endregion task

//#region finalize task
export type GeoserverLayerName = `${string}_${string}`;
export type MapproxyLayerName = `${string}-${string}`;

export interface LayerNameFormats {
  geoserver: GeoserverLayerName;
  mapproxy: MapproxyLayerName;
}
//#endregion finalize task

//#region mapproxyApi
export interface IPublishMapLayerRequest {
  name: string;
  tilesPath: string;
  cacheType: PublishedLayerCacheType;
  format: TileOutputFormat;
}

export interface IGetMapproxyCacheRequest {
  layerName: MapproxyLayerName;
  cacheType: PublishedLayerCacheType;
}

export interface IGetMapproxyCacheResponse {
  cacheName: string;
  cache: { type: PublishedLayerCacheType };
}
//#endregion mapproxyApi

//#region geoserverApi
export interface IInsertGeoserverRequest {
  nativeName: string;
}
//#endregion geoserverApi

//#region catalogClient

export interface PartAggregatedData {
  imagingTimeBeginUTC: Date;
  imagingTimeEndUTC: Date;
  minHorizontalAccuracyCE90: number;
  maxHorizontalAccuracyCE90: number;
  sensors: string[];
  maxResolutionDeg: number;
  minResolutionDeg: number;
  maxResolutionMeter: number;
  minResolutionMeter: number;
  footprint: Polygon;
  productBoundingBox: string;
}

export interface ICatalogUpdateRequestBody {
  metadata: CatalogUpdateMetadata;
}

export type CatalogUpdateMetadata = Partial<LayerMetadata>;
//#endregion catalogClient

//#region seedingJobCreator

export interface ISeedJobParams {
  mode: SeedMode;
  geometry: Footprint;
  layerName: MapproxyLayerName;
  ingestionJob: IJobResponse<unknown, unknown>;
}
export interface ISeedTaskOptions {
  mode: SeedMode;
  grid: string;
  fromZoomLevel: number;
  toZoomLevel: number;
  geometry: Footprint;
  skipUncached: boolean;
  layerId: string; // cache name as configured in mapproxy
  refreshBefore: string;
}

export interface ISeedTaskParams {
  seedTasks: ISeedTaskOptions[];
  catalogId: string;
  traceParentContext?: ITraceParentContext;
  cacheType: PublishedLayerCacheType;
}

//#endregion seedingJobCreator

//#region trace
export interface ITraceParentContext {
  traceparent?: string;
  tracestate?: string;
}
//#endregion trace
