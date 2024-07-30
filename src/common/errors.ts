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
