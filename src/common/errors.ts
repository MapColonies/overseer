export class InvalidConfigError extends Error {
  public constructor(message?: string) {
    super(message);
    this.name = InvalidConfigError.name;
  }
}

export class MissingConfigError extends Error {
  public constructor(message?: string) {
    super(message);
    this.name = MissingConfigError.name;
  }
}

export class JobHandlerNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = JobHandlerNotFoundError.name;
  }
}

export class UnsupportedTransparencyError extends Error {
  public constructor(transparency: string) {
    super(`unsupported transparency value: ${transparency}`);
    this.name = UnsupportedTransparencyError.name;
  }
}

export class UnsupportedStorageProviderError extends Error {
  public constructor(storageProvider: string) {
    super(`Unsupported storage provider: ${storageProvider}`);
    this.name = UnsupportedStorageProviderError.name;
  }
}

export class PublishLayerError extends Error {
  public constructor(targetClient: string, layerName: string, err: Error) {
    super(`Failed to publish ${layerName} layer to ${targetClient} client: ${err.message}`);
    this.name = PublishLayerError.name;
    this.stack = err.stack;
  }
}

export class UpdateLayerError extends Error {
  public constructor(targetClient: string, updateId: string, err: Error) {
    super(`Failed to update layer ${updateId} in ${targetClient} client: ${err.message}`);
    this.name = UpdateLayerError.name;
    this.stack = err.stack;
  }
}

export class LayerNotFoundError extends Error {
  public constructor(id: string) {
    super(`Record with id ${id} not found`);
    this.name = LayerNotFoundError.name;
  }
}

export class UnsupportedLayerCacheError extends Error {
  public constructor(layerName: string, cacheType: string) {
    super(`Unsupported cache type(${cacheType}) for layer ${layerName} (redis only)`);
    this.name = UnsupportedLayerCacheError.name;
  }
}

export class LayerCacheNotFoundError extends Error {
  public constructor(layerName: string, cacheType: string) {
    super(`Cache not found for layer ${layerName} with cache type ${cacheType}`);
    this.name = LayerCacheNotFoundError.name;
  }
}

export class SeedJobCreationError extends Error {
  public constructor(msg: string, err: Error) {
    super(msg);
    this.name = SeedJobCreationError.name;
    this.stack = err.stack;
  }
}

export class S3Error extends Error {
  public constructor(err: unknown, customMessage?: string) {
    const message = `S3 Error(${customMessage}): ${err instanceof Error ? err.message : 'unknown'}`;
    super(message);
    this.name = S3Error.name;
    this.stack = err instanceof Error ? err.stack : undefined;
  }
}

export class FSError extends Error {
  public constructor(err: unknown, customMessage?: string) {
    const message = `FS Error(${customMessage}): ${err instanceof Error ? err.message : 'unknown'}`;
    super(message);
    this.name = FSError.name;
    this.stack = err instanceof Error ? err.stack : undefined;
  }
}

export class LayerMetadataAggregationError extends Error {
  public constructor(err: unknown, polygonPartsEntityName: string) {
    const message = `Failed to get aggregated layer metadata for ${polygonPartsEntityName}: ${err instanceof Error ? err.message : 'unknown'}`;
    super(message);
    this.name = LayerMetadataAggregationError.name;
    this.stack = err instanceof Error ? err.stack : undefined;
  }
}
