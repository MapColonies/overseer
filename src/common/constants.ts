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
} satisfies Record<string, symbol>;

export const JOB_TYPES = {
  Ingestion_New: 'Ingestion_New',
  Ingestion_Update: 'Ingestion_Update',
  Ingestion_Swap_Update: 'Ingestion_Swap_Update',
} as const satisfies Record<string, string>;
/* eslint-enable @typescript-eslint/naming-convention */
