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
