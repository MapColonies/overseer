import express from 'express';
import type { Registry } from 'prom-client';
import { collectMetricsExpressMiddleware } from '@map-colonies/telemetry/prom-metrics';
import { inject, injectable } from 'tsyringe';
import type { Logger } from '@map-colonies/js-logger';
import { SERVICES } from './common/constants';
import type { IConfig } from './common/interfaces';

@injectable()
export class ServerBuilder {
  private readonly serverInstance: express.Application;

  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.METRICS) private readonly metricsRegistry?: Registry
  ) {
    this.serverInstance = express();
  }

  public build(): express.Application {
    if (this.metricsRegistry) {
      this.logger.info({ msg: 'Collecting metrics' });
      this.serverInstance.use(collectMetricsExpressMiddleware({ registry: this.metricsRegistry }));
    }
    return this.serverInstance;
  }
}
