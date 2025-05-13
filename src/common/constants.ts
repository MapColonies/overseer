import { OperationStatus } from '@map-colonies/mc-priority-queue';
import { CallbacksStatus } from '@map-colonies/raster-shared';
import { readPackageJsonSync } from '@map-colonies/read-pkg';

export const SERVICE_NAME = readPackageJsonSync().name ?? 'unknown_service';
export const SERVICE_VERSION = readPackageJsonSync().version ?? 'unknown_version';
export const DEFAULT_SERVER_PORT = 80;
export const GPKG_CONTENT_TYPE = 'application/geopackage+sqlite3';
export const JSON_CONTENT_TYPE = 'application/json';
export const GPKGS_PREFIX = 'gpkgs';
export const EXPORT_FAILURE_MESSAGE = 'The export process could not be completed. Error occurred.';
export const EXPORT_SUCCESS_MESSAGE = 'The export process completed successfully.';

export const IGNORED_OUTGOING_TRACE_ROUTES = [/^.*\/v1\/metrics.*$/];
export const IGNORED_INCOMING_TRACE_ROUTES = [/^.*\/docs.*$/];

/* eslint-disable @typescript-eslint/naming-convention */
export const SERVICES = {
  LOGGER: Symbol('Logger'),
  CONFIG: Symbol('Config'),
  TRACER: Symbol('Tracer'),
  METRICS: Symbol('METRICS'),
  S3CONFIG: Symbol('S3Config'),
  QUEUE_CLIENT: Symbol('QueueClient'),
  TILE_RANGER: Symbol('TileRanger'),
} satisfies Record<string, symbol>;

export const INJECTION_VALUES = {
  ingestionJobTypes: Symbol('IngestionJobTypes'),
} satisfies Record<string, symbol>;

export const StorageProvider = {
  FS: 'FS',
  S3: 'S3',
} as const;

export type StorageProvider = (typeof StorageProvider)[keyof typeof StorageProvider];

export const LayerCacheType = {
  FS: 'file',
  S3: 's3',
  REDIS: 'redis',
} as const;

export type LayerCacheType = (typeof LayerCacheType)[keyof typeof LayerCacheType];

export const storageProviderToCacheTypeMap = new Map([
  [StorageProvider.FS, LayerCacheType.FS],
  [StorageProvider.S3, LayerCacheType.S3],
]);

export const SeedMode = {
  SEED: 'seed',
  CLEAN: 'clean',
} as const;

export type SeedMode = (typeof SeedMode)[keyof typeof SeedMode];

export type CompletedOrFailedStatus = Exclude<CallbacksStatus, OperationStatus.IN_PROGRESS>;
/* eslint-enable @typescript-eslint/naming-convention */
