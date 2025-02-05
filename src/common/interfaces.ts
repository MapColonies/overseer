import { z } from 'zod';
import type { IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import type { LayerMetadata } from '@map-colonies/mc-model-types';
import type {
  InputFiles,
  PolygonPart,
  IngestionNewFinalizeTaskParams,
  IngestionUpdateFinalizeTaskParams,
  IngestionSwapUpdateFinalizeTaskParams,
  TileOutputFormat,
  LayerName,
} from '@map-colonies/raster-shared';
import type { BBox, Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { ITileRange } from '@map-colonies/mc-utils';
import type { Span } from '@opentelemetry/api';
import type { IngestionSwapUpdateFinalizeJob, IngestionUpdateFinalizeJob } from '../utils/zod/schemas/job.schema';
import {
  ingestionSwapUpdateFinalizeJobParamsSchema,
  ingestionUpdateFinalizeJobParamsSchema,
  extendedRasterLayerMetadataSchema,
  ingestionNewExtendedJobParamsSchema,
} from '../utils/zod/schemas/jobParameters.schema';
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
export interface IJobHandler<TInitJob = unknown, TInitTask = unknown, TFinalizeJob = unknown, TFinalizeTask = unknown> {
  handleJobInit: (job: TInitJob, task: TInitTask) => Promise<void>;
  handleJobFinalize: (job: TFinalizeJob, task: TFinalizeTask) => Promise<void>;
}

export interface JobAndTaskResponse {
  job: IJobResponse<unknown, unknown>;
  task: ITaskResponse<unknown>;
}

export type TaskResponse<T> = { task: ITaskResponse<T>; shouldSkipTask: false } | { task: null; shouldSkipTask: true };

export type ExtendedRasterLayerMetadata = z.infer<typeof extendedRasterLayerMetadataSchema>;

export type IngestionUpdateFinalizeJobParams = z.infer<typeof ingestionUpdateFinalizeJobParamsSchema>;

export type IngestionSwapUpdateFinalizeJobParams = z.infer<typeof ingestionSwapUpdateFinalizeJobParamsSchema>;

export type IngestionNewExtendedJobParams = z.infer<typeof ingestionNewExtendedJobParamsSchema>;

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

export interface PolygonProperties {
  maxZoom: number;
}

export type PolygonFeature = Feature<Polygon, PolygonProperties>;

export type PPFeatureCollection = FeatureCollection<Polygon, PolygonProperties>;

export interface FeatureCollectionWitZoomDefinitions {
  ppCollection: PPFeatureCollection;
  zoomDefinitions: ZoomDefinitions;
}

export interface ZoomDefinitions {
  maxZoom: number;
  partsZoomLevelMatch: boolean;
}

export interface TilesSource {
  fileName: string;
  tilesPath: string;
}

export type UnifiedPart = {
  footprint: Feature<Polygon | MultiPolygon>;
  extent: BBox;
} & TilesSource;

export interface MergeParameters {
  ppCollection: PPFeatureCollection;
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

//#endregion task

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
  ingestionJob: IngestionUpdateFinalizeJob | IngestionSwapUpdateFinalizeJob;
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

//#region telemetry
export interface TraceParentContext {
  traceparent?: string;
  tracestate?: string;
}

export type TaskProcessingTracker =
  | {
      success: () => void;
      failure: (errorType: string) => void;
    }
  | undefined;

export interface JobAndTaskTelemetry {
  taskTracker?: TaskProcessingTracker;
  tracingSpan?: Span;
}
//#endregion telemetry
