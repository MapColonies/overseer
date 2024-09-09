import { Logger } from '@map-colonies/js-logger';

interface Metadata {
  [key: string]: unknown;
}

export const extractBindingsMetadata = (logger: Logger): Metadata => {
  const bindings = logger.bindings();
  if ('metadata' in bindings && typeof bindings.metadata === 'object') {
    return bindings.metadata as Metadata;
  }
  return {};
};

export interface LogContext {
  fileName: string;
  class?: string;
  function?: string;
}
