import type { Logger } from '@map-colonies/js-logger';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import type { IHttpRetryConfig } from '@map-colonies/mc-utils';
import type { DependencyContainer } from 'tsyringe';
import { SERVICES } from '../common/constants';
import type { IConfig, JobManagerConfig } from '../common/interfaces';

export const queueClientFactory = (container: DependencyContainer): QueueClient => {
  const logger = container.resolve<Logger>(SERVICES.LOGGER);
  const config = container.resolve<IConfig>(SERVICES.CONFIG);
  const queueConfig = config.get<JobManagerConfig>('jobManagement.config');
  const httpRetryConfig = config.get<IHttpRetryConfig>('httpRetry');
  const disableHttpClientLogs = config.get<boolean>('disableHttpClientLogs');
  const jobManagerServiceName = 'JobManager';
  const heartbeatServiceName = 'Heartbeat';
  return new QueueClient(
    logger,
    queueConfig.jobManagerBaseUrl,
    queueConfig.heartbeat.baseUrl,
    queueConfig.dequeueIntervalMs,
    queueConfig.heartbeat.intervalMs,
    httpRetryConfig,
    jobManagerServiceName,
    heartbeatServiceName,
    disableHttpClientLogs
  );
};