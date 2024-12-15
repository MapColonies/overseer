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
  IngestionUpdateJobParams,
} from '@map-colonies/mc-model-types';
import { TilesMimeFormat } from '@map-colonies/types';
import { BBox, Feature, MultiPolygon, Polygon } from 'geojson';
import { ITileRange } from '@map-colonies/mc-utils';
import { LayerCacheType, SeedMode } from './constants';

//#region config interfaces
export interface IConfig {
  get: <T>(setting: string) => T;
  has: (setting: string) => boolean;
}

export interface HeartbeatConfig {
  baseUrl: string;
  intervalMs: number;
}

export interface JobManagerConfig {
  jobManagerBaseUrl: string;
  heartbeat: HeartbeatConfig;
  dequeueIntervalMs: number;
}

export interface TaskConfig {
  [key: string]: string;
}

export interface JobConfig {
  type: string;
}

export interface IngestionJobs {
  seed: JobConfig | undefined;
}

export interface IngestionPollingJobs {
  [key: string]: JobConfig | undefined;
  new: JobConfig | undefined;
  update: JobConfig | undefined;
  swapUpdate: JobConfig | undefined;
}

export interface PollingTasks {
  init: string;
  finalize: string;
}

export interface IngestionConfig {
  pollingTasks: PollingTasks;
  pollingJobs: IngestionPollingJobs;
  jobs: IngestionJobs;
  maxTaskAttempts: number;
}

export interface TilesSeedingTaskConfig {
  type: string;
  grid: string;
  maxZoom: number;
  skipUncached: boolean;
}
//#endregion config

//#region job/task interfaces
export interface IJobHandler {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleJobInit: (job: IJobResponse<any, any>, task: ITaskResponse<any>) => Promise<void>;
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

export type ExtendedNewRasterLayer = { metadata: ExtendedRasterLayerMetadata; additionalParams: Record<string, unknown> } & LayerData;

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

export type Footprint = Polygon | MultiPolygon | Feature<Polygon | MultiPolygon>;

export type PolygonFeature = Feature<Polygon, { maxZoom: number }>;

export interface TilesSource {
  fileName: string;
  tilesPath: string;
}

export interface UnifiedPart {
  fileName: string;
  tilesPath: string;
  footprint: Feature<Polygon | MultiPolygon>;
  extent: BBox;
}

export interface MergeParameters {
  parts: PolygonFeature[];
  zoomDefinitions: ZoomDefinitions;
  taskMetadata: MergeTilesMetadata;
  tilesSource: TilesSource;
}

export interface MergeSources {
  type: string;
  path: string;
  grid?: Grid;
  extent?: IBBox;
}

export interface MergeTaskParameters {
  targetFormat: TileOutputFormat;
  isNewTarget: boolean;
  sources: MergeSources[];
  batches: ITileRange[];
}

export interface PartsIntersection {
  parts: PolygonFeature[];
  intersection: Footprint | null;
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

export interface PartsWitZoomDefinitions {
  parts: PolygonFeature[];
  zoomDefinitions: ZoomDefinitions;
}

export interface ZoomDefinitions {
  maxZoom: number;
  partsZoomLevelMatch: boolean;
}
//#endregion task

//#region finalize task
export type NativeName = `${string}_${string}`;
export type LayerName = `${string}-${string}`;

export interface LayerNameFormats {
  nativeName: NativeName;
  layerName: LayerName;
}
//#endregion finalize task

//#region mapproxyApi
export interface PublishMapLayerRequest {
  name: string;
  tilesPath: string;
  cacheType: LayerCacheType;
  format: TileOutputFormat;
}

export interface GetMapproxyCacheRequest {
  layerName: LayerName;
  cacheType: LayerCacheType;
}

export interface GetMapproxyCacheResponse {
  cacheName: string;
  cache: { type: LayerCacheType };
}
//#endregion mapproxyApi

//#region geoserverApi
export interface InsertGeoserverRequest {
  name: LayerName;
  nativeName: NativeName;
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

export interface CatalogUpdateRequestBody {
  metadata: CatalogUpdateMetadata;
}

export type CatalogUpdateMetadata = Partial<LayerMetadata>;

export interface CatalogUpdateAdditionalParams {
  displayPath?: string;
  polygonPartsEntityName: string;
}
//#endregion catalogClient

//#region seedingJobCreator

export interface SeedJobParams {
  mode: SeedMode;
  layerName: LayerName;
  ingestionJob: IJobResponse<IngestionUpdateJobParams, unknown>;
}
export interface SeedTaskOptions {
  mode: SeedMode;
  grid: string;
  fromZoomLevel: number;
  toZoomLevel: number;
  geometry: Footprint;
  skipUncached: boolean;
  layerId: string; // cache name as configured in mapproxy
  refreshBefore: string;
}

export interface SeedTaskParams {
  seedTasks: SeedTaskOptions[];
  catalogId: string;
  traceParentContext?: TraceParentContext;
  cacheType: LayerCacheType;
}

//#endregion seedingJobCreator

//#region trace
export interface TraceParentContext {
  traceparent?: string;
  tracestate?: string;
}
//#endregion trace
