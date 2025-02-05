/* eslint-disable @typescript-eslint/naming-convention */
import config from 'config';
import { getOtelMixin } from '@map-colonies/telemetry';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import type { IHttpRetryConfig } from '@map-colonies/mc-utils';
import { TileRanger } from '@map-colonies/mc-utils';
import { trace } from '@opentelemetry/api';
import { Registry } from 'prom-client';
import { instanceCachingFactory, instancePerContainerCachingFactory } from 'tsyringe';
import type { DependencyContainer } from 'tsyringe/dist/typings/types';
import type { Logger, LoggerOptions } from '@map-colonies/js-logger';
import jsLogger from '@map-colonies/js-logger';
import { INJECTION_VALUES, SERVICES, SERVICE_NAME, SERVICE_VERSION } from './common/constants';
import { tracing } from './common/tracing';
import { InjectionObject, registerDependencies } from './common/dependencyRegistration';
import { NewJobHandler } from './job/models/newJobHandler';
import { UpdateJobHandler } from './job/models/updateJobHandler';
import { JOB_HANDLER_FACTORY_SYMBOL, jobHandlerFactory } from './job/models/jobHandlerFactory';
import { validateAndGetHandlersTokens } from './utils/configUtil';
import { SwapJobHandler } from './job/models/swapJobHandler';
import { IConfig, JobManagerConfig, IngestionPollingJobs } from './common/interfaces';

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
export interface RegisterOptions {
  override?: InjectionObject<unknown>[];
  useChild?: boolean;
}

export const registerExternalValues = (options?: RegisterOptions): DependencyContainer => {
  const loggerConfig = config.get<LoggerOptions>('telemetry.logger');
  const logger = jsLogger({ ...loggerConfig, prettyPrint: loggerConfig.prettyPrint, mixin: getOtelMixin(), pinoCaller: loggerConfig.pinoCaller });

  const metricsRegistry = new Registry();
  const tracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);

  const ingestionConfig = config.get<IngestionPollingJobs>('jobManagement.ingestion.pollingJobs');

  const handlersTokens = validateAndGetHandlersTokens(ingestionConfig);

  const dependencies: InjectionObject<unknown>[] = [
    { token: SERVICES.CONFIG, provider: { useValue: config } },
    { token: SERVICES.LOGGER, provider: { useValue: logger } },
    { token: SERVICES.TRACER, provider: { useValue: tracer } },
    { token: SERVICES.QUEUE_CLIENT, provider: { useFactory: instancePerContainerCachingFactory(queueClientFactory) } },
    { token: JOB_HANDLER_FACTORY_SYMBOL, provider: { useFactory: instancePerContainerCachingFactory(jobHandlerFactory) } },
    { token: handlersTokens.Ingestion_New, provider: { useClass: NewJobHandler } },
    { token: handlersTokens.Ingestion_Update, provider: { useClass: UpdateJobHandler } },
    { token: handlersTokens.Ingestion_Swap_Update, provider: { useClass: SwapJobHandler } },
    { token: SERVICES.TILE_RANGER, provider: { useClass: TileRanger } },
    { token: INJECTION_VALUES.ingestionJobTypes, provider: { useValue: handlersTokens } },
    {
      token: SERVICES.METRICS,
      provider: {
        useFactory: instanceCachingFactory((container) => {
          const config = container.resolve<IConfig>(SERVICES.CONFIG);

          if (config.get<boolean>('telemetry.metrics.enabled')) {
            metricsRegistry.setDefaultLabels({
              app: SERVICE_NAME,
            });
            return metricsRegistry;
          }
        }),
      },
    },
    {
      token: 'onSignal',
      provider: {
        useValue: {
          useValue: async (): Promise<void> => {
            await Promise.all([tracing.stop()]);
          },
        },
      },
    },
  ];

  return registerDependencies(dependencies, options?.override, options?.useChild);
};
