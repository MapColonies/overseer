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
  public constructor(publishingClient: string, layerName: string, err: Error) {
    super(`Failed to publish ${layerName} layer to ${publishingClient} client: ${err.message}`);
    this.name = PublishLayerError.name;
    this.stack = err.stack;
  }
}
