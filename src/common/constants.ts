import { readPackageJsonSync } from '@map-colonies/read-pkg';

export const SERVICE_NAME = readPackageJsonSync().name ?? 'unknown_service';
export const DEFAULT_SERVER_PORT = 80;

export const IGNORED_OUTGOING_TRACE_ROUTES = [/^.*\/v1\/metrics.*$/];
export const IGNORED_INCOMING_TRACE_ROUTES = [/^.*\/docs.*$/];

/* eslint-disable @typescript-eslint/naming-convention */
export const SERVICES = {
  LOGGER: Symbol('Logger'),
  CONFIG: Symbol('Config'),
  TRACER: Symbol('Tracer'),
  METER: Symbol('Meter'),
  QUEUE_CLIENT: Symbol('QueueClient'),
  TILE_RANGER: Symbol('TileRanger'),
} satisfies Record<string, symbol>;

export const TilesStorageProvider = {
  FS: 'FS',
  S3: 'S3',
} as const;

export type TilesStorageProvider = (typeof TilesStorageProvider)[keyof typeof TilesStorageProvider];

export const PublishedLayerCacheType = {
  FS: 'file',
  S3: 's3',
  REDIS: 'redis',
} as const;

export type PublishedLayerCacheType = (typeof PublishedLayerCacheType)[keyof typeof PublishedLayerCacheType];

export const storageProviderToCacheTypeMap = new Map([
  [TilesStorageProvider.FS, PublishedLayerCacheType.FS],
  [TilesStorageProvider.S3, PublishedLayerCacheType.S3],
]);

/* eslint-enable @typescript-eslint/naming-convention */
