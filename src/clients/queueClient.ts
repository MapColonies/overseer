import { Logger } from '@map-colonies/js-logger';
import { TaskHandler as QueueHandler } from '@map-colonies/mc-priority-queue';
import { IHttpRetryConfig } from '@map-colonies/mc-utils';
import { inject, singleton } from 'tsyringe';
import { SERVICES } from '../common/constants';
import { IConfig, IQueueConfig } from '../common/interfaces';

@singleton()
export class QueueClient {
  public readonly queueHandler: QueueHandler;
  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger, @inject(SERVICES.CONFIG) private readonly config: IConfig) {
    const queueConfig = this.config.get<IQueueConfig>('queue');
    const httpRetryConfig = this.config.get<IHttpRetryConfig>('server.httpRetry');
    this.queueHandler = new QueueHandler(
      logger,
      queueConfig.jobManagerBaseUrl,
      queueConfig.heartbeat.baseUrl,
      queueConfig.dequeueIntervalMs,
      queueConfig.heartbeat.intervalMs,
      httpRetryConfig
    );
  }
}
