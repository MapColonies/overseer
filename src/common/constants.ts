import { readPackageJsonSync } from '@map-colonies/read-pkg';

export const SERVICE_NAME = readPackageJsonSync().name ?? 'unknown_service';
export const SERVICE_VERSION = readPackageJsonSync().version ?? 'unknown_version';
export const DEFAULT_SERVER_PORT = 80;
export const COMPLETED_PERCENTAGE = 100;
export const JOB_SUCCESS_MESSAGE = 'Job completed successfully';

export const IGNORED_OUTGOING_TRACE_ROUTES = [/^.*\/v1\/metrics.*$/];
export const IGNORED_INCOMING_TRACE_ROUTES = [/^.*\/docs.*$/];

/* eslint-disable @typescript-eslint/naming-convention */
export const SERVICES = {
  LOGGER: Symbol('Logger'),
  CONFIG: Symbol('Config'),
  TRACER: Symbol('Tracer'),
  METRICS: Symbol('METRICS'),
  QUEUE_CLIENT: Symbol('QueueClient'),
  TILE_RANGER: Symbol('TileRanger'),
} satisfies Record<string, symbol>;

export const INJECTION_VALUES = {
  ingestionJobTypes: Symbol('IngestionJobTypes'),
} satisfies Record<string, symbol>;

export const TilesStorageProvider = {
  FS: 'FS',
  S3: 'S3',
} as const;

export type TilesStorageProvider = (typeof TilesStorageProvider)[keyof typeof TilesStorageProvider];

export const LayerCacheType = {
  FS: 'file',
  S3: 's3',
  REDIS: 'redis',
} as const;

export type LayerCacheType = (typeof LayerCacheType)[keyof typeof LayerCacheType];

export const storageProviderToCacheTypeMap = new Map([
  [TilesStorageProvider.FS, LayerCacheType.FS],
  [TilesStorageProvider.S3, LayerCacheType.S3],
]);

export const SeedMode = {
  SEED: 'seed',
  CLEAN: 'clean',
} as const;

export type SeedMode = (typeof SeedMode)[keyof typeof SeedMode];

export const SqlDataType = {
  TEXT: 'TEXT',
  INTEGER: 'INTEGER',
  REAL: 'REAL',
  NULL: 'NULL',
} as const;

export type SqlDataType = (typeof SqlDataType)[keyof typeof SqlDataType];

/* eslint-enable @typescript-eslint/naming-convention */
