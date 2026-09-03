import type { Logger } from '@map-colonies/js-logger';
import type { ICreateTaskBody, IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import type { ITileRange } from '@map-colonies/mc-utils';
import type {
  PolygonPartsPayload,
  aggregationFeatureSchema,
  IngestionNewFinalizeTaskParams,
  IngestionSwapUpdateFinalizeTaskParams,
  IngestionUpdateFinalizeTaskParams,
  InputFiles,
  LayerName,
  RasterLayerMetadata,
  RedisDeleteStoredResourcesParams,
  RedisTilesDeletionParams,
  TileFormatStrategy,
  TileOutputFormat,
} from '@map-colonies/raster-shared';
import type { Span, SpanContext } from '@opentelemetry/api';
import type { Units } from '@turf/turf';
import type { BBox, Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { z } from 'zod';
import type { ExportFinalizeTask, ExportJob, IngestionSwapUpdateFinalizeJob, IngestionUpdateFinalizeJob } from '../utils/zod/schemas/job.schema';
import type {
  extendedRasterLayerMetadataSchema,
  ingestionNewExtendedJobParamsSchema,
  ingestionSwapUpdateFinalizeJobParamsSchema,
  ingestionUpdateFinalizeJobParamsSchema,
} from '../utils/zod/schemas/jobParameters.schema';
import type { LayerCacheType } from './constants';

export type StepKey<T> = keyof T & { [K in keyof T]: T[K] extends boolean ? K : never }[keyof T]; // this is a utility type that extracts the keys of T that are of type boolean

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

export interface GeoserverConfig {
  workspace: string;
  datastore: string;
}

export interface TaskConfig {
  [key: string]: string;
}

export interface JobConfig {
  type: string;
}

export interface IngestionJobsConfig {
  seed: JobConfig | undefined;
  updateCacheDeletion: JobConfig | undefined;
  swapCacheDeletion: JobConfig | undefined;
}

export interface IngestionPollingJobsConfig {
  [key: string]: JobConfig | undefined;
  new: JobConfig | undefined;
  update: JobConfig | undefined;
  swapUpdate: JobConfig | undefined;
  deleteLayer: JobConfig | undefined;
}

export interface ExportPollingJobsConfig {
  [key: string]: JobConfig | undefined;
  export: JobConfig | undefined;
}

export interface IngestionTasksConfig {
  tilesMerging: TilesMergingTaskConfig;
  tilesSeeding: TilesSeedingTaskConfig;
  tilesDeletion: TilesDeletionTaskConfig;
  cacheDeletion: CacheDeletionTaskConfig;
}

export interface ExportTasksConfig {
  tilesExporting: TilesExportingTaskConfig;
}

export type PollingJobs = IngestionPollingJobsConfig | ExportPollingJobsConfig;

export interface PollingTasks {
  createTasks: string;
  init: string;
  finalize: string;
  delete: string;
}

export interface PollingConfig {
  tasks: PollingTasks;
  maxTaskAttempts: number;
}

export interface TilesMergingTaskConfig {
  type: string;
  tileBatchSize: number;
  taskBatchSize: number;
  radiusBuffer: number;
  radiusBufferUnits: Units;
  truncatePrecision: number;
  truncateCoordinates: number;
}

export interface TilesDeletionTaskConfig {
  type: string;
  tileBatchSize: number;
  taskBatchSize: number;
}

export interface TilesSeedingTaskConfig {
  type: string;
  grid: string;
  maxZoom: number;
  skipUncached: boolean;
}

export interface CacheDeletionTaskConfig {
  /** `tiles-deletion` - shared with the S3/FS path, told apart by job type */
  type: string;
  maxZoom: number;
  /** max tiles a single range-deletion task covers */
  tileBatchSize: number;
  /** max ITileRange objects a single task carries, bounding the serialized params size */
  maxRangesPerTask: number;
  /** tasks pushed per createTaskForJob call */
  taskBatchSize: number;
  /** mirrors helm's global.gracefulReloadMaxSeconds */
  gracefulReloadMaxSeconds: number;
  /** added on top, covering mapproxinator's <=5s poll plus pod drain */
  reloadWindowMarginSeconds: number;
}

export interface TilesExportingTaskConfig {
  type: string;
}

export interface JobManagementConfig {
  config: JobManagerConfig;
  polling: PollingConfig;
  ingestion: {
    pollingJobs: IngestionPollingJobsConfig;
    jobs: IngestionJobsConfig;
    tasks: IngestionTasksConfig;
  };
  export: { pollingJobs: ExportPollingJobsConfig; tasks: ExportTasksConfig };
}
//#endregion config

//#region job/task interfaces
export interface IJobHandler<
  TInitJob = unknown,
  TInitTask = unknown,
  TFinalizeJob = unknown,
  TFinalizeTask = unknown,
  TDeleteJob = unknown,
  TDeleteTask = unknown,
> {
  handleJobInit?: (job: TInitJob, task: TInitTask) => Promise<void>;
  handleJobFinalize?: (job: TFinalizeJob, task: TFinalizeTask) => Promise<void>;
  handleJobDelete?: (job: TDeleteJob, task: TDeleteTask) => Promise<void>;
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

export type IngestionFinalizeTaskParams = IngestionNewFinalizeTaskParams | IngestionUpdateFinalizeTaskParams | IngestionSwapUpdateFinalizeTaskParams;

//#endregion job/task

//#region merge task

export interface MergeTask {
  mergeTasksGenerator: MergeTaskParameters;
  latestTaskIndex: JobResumeState;
}

export enum Grid {
  TWO_ON_ONE = '2x1',
}

export interface JobResumeState {
  lastInsertedTaskIndex: number;
  zoomLevel: number;
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
  isMultiResolution: boolean;
}

export interface TilesSource {
  fileName: string;
  tilesPath: string;
}

export type ProductFeature = Feature<Polygon | MultiPolygon, ProductProperties>;
export type FeatureTask = ProductFeature;

export interface MergeParameters {
  product: ProductFeature;
  taskMetadata: MergeTilesMetadata;
}

export interface ProductProperties {
  zoomDefinitions: ZoomDefinitions;
  tilesSource: TilesSource;
}

export interface TaskSources {
  type: string;
  path: string;
  grid?: Grid;
  extent?: IBBox;
}

export interface MergeTaskParameters {
  targetFormat: TileOutputFormat;
  isNewTarget: boolean;
  sources: TaskSources[];
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
  ingestionResolution: number;
  productGeometry: Polygon | MultiPolygon;
}

export interface MergeTilesMetadata {
  layerRelativePath: string;
  tileOutputFormat: TileOutputFormat;
  isNewTarget: boolean;
  grid: Grid;
}

export interface BuildDeletionTaskParams {
  polygonPartsEntityName: string;
  layerRelativePath: string;
  ingestionResolution: number;
  tileOutputFormat: TileOutputFormat;
  reportUrl: string;
}

//#endregion task

//#region exportTask

export interface ZoomBoundsParameters {
  minZoom: number;
  maxZoom: number;
  bbox: BBox;
}

export interface ExportTaskParameters {
  isNewTarget: boolean;
  targetFormat?: TileOutputFormat;
  outputFormatStrategy: TileFormatStrategy;
  batches: ITileRange[];
  sources: TaskSources[];
  traceParentContext?: SpanContext;
}

export type ExportTask = ICreateTaskBody<ExportTaskParameters>;

export type GpkgArtifactProperties = Omit<RasterLayerMetadata, 'productStatus' | 'footprint'>;
export type JsonArtifactProperties = Omit<RasterLayerMetadata, 'productStatus'> & { sha256: string };

//#endregion exportTask

//#region exportFinalizeTask

export interface ExportFinalizeExecutionContext {
  job: ExportJob;
  task: ExportFinalizeTask;
  paths: ExportFinalizeGpkgPaths;
  telemetry: JobAndTaskTelemetry;
  logger: Logger;
}

export interface ExportFinalizeGpkgPaths {
  gpkgFilePath: string;
  gpkgRelativePath: string;
  gpkgDirPath: string;
}

//#endregion exportFinalizeTask

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
  // eslint-disable-next-line @typescript-eslint/naming-convention
  cache: { type: LayerCacheType; directory?: string; directory_layout?: string; bucket_name?: string };
  /** the grids the cache is served on; mapproxy derives one redis key prefix per grid */
  grids?: string[];
}
//#endregion mapproxyApi

//#region geoserverApi
export interface InsertGeoserverRequest {
  name: LayerName;
  nativeName: string;
}
//#endregion geoserverApi

//#region catalogClient

export type AggregationLayerMetadata = z.infer<typeof aggregationFeatureSchema>['properties'] & {
  footprint: Polygon | MultiPolygon;
};

export interface CatalogUpdateRequestBody {
  metadata: CatalogUpdateMetadata;
}

export type FindLayerBody = Pick<RasterLayerMetadata, 'id'>;

export interface FindLayerResponse {
  metadata: RasterLayerMetadata;
}

export type CatalogUpdateMetadata = Partial<RasterLayerMetadata>;

//#endregion catalogClient

//#region PolygonPartsManagerClient
export type PolygonPartsProcessPayload = Pick<PolygonPartsPayload, 'productId' | 'productType'> & { shouldClearEntities?: boolean };
//#endregion PolygonPartsManagerClient

//#region cacheDeletionJobCreator

export interface CacheDeletionJobParams {
  layerName: LayerName;
  ingestionJob: IngestionUpdateFinalizeJob | IngestionSwapUpdateFinalizeJob;
}

/**
 * Params of a `tiles-deletion` cache-deletion task. Both shapes share that task type; which one a
 * task carries follows from the job type - Update_Delete_Cache means `ranges`, Swap_Delete_Cache
 * means prefix-only - and that is also how cleaner picks the strategy to run.
 */
export type CacheDeletionTaskParams = RedisTilesDeletionParams | RedisDeleteStoredResourcesParams;

//#endregion cacheDeletionJobCreator

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

//#region s3
export interface IS3Config {
  accessKeyId: string;
  secretAccessKey: string;
  endpointUrl: string;
  artifactsBucket: string;
  tilesBucket: string;
  objectKey: string;
  sslEnabled: boolean;
}
//#endregion s3
