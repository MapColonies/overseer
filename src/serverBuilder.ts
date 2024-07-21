import express from 'express';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { collectMetricsExpressMiddleware } from '@map-colonies/telemetry';
import { SERVICES } from './common/constants';
import { IConfig } from './common/interfaces';

@injectable()
export class ServerBuilder {
  private readonly serverInstance: express.Application;

  public constructor(@inject(SERVICES.CONFIG) private readonly config: IConfig, @inject(SERVICES.LOGGER) private readonly logger: Logger) {
    this.serverInstance = express();
  }

  public build(): express.Application {
    this.serverInstance.use(collectMetricsExpressMiddleware({}));
    return this.serverInstance;
  }
}
