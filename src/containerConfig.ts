/* eslint-disable @typescript-eslint/naming-convention */
import config from 'config';
import { getOtelMixin } from '@map-colonies/telemetry';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { IHttpRetryConfig } from '@map-colonies/mc-utils';
import { trace, metrics as OtelMetrics } from '@opentelemetry/api';
import { instancePerContainerCachingFactory } from 'tsyringe';
import { DependencyContainer } from 'tsyringe/dist/typings/types';
import jsLogger, { Logger, LoggerOptions } from '@map-colonies/js-logger';
import { Metrics } from '@map-colonies/telemetry';
import { SERVICES, SERVICE_NAME } from './common/constants';
import { tracing } from './common/tracing';
import { InjectionObject, registerDependencies } from './common/dependencyRegistration';
import { NewJobHandler } from './models/newJobHandler';
import { UpdateJobHandler } from './models/updateJobHandler';
import { JOB_HANDLER_FACTORY_SYMBOL, jobHandlerFactory } from './models/jobHandlerFactory';
import { validateAndGetHandlersTokens } from './utils/configUtil';
import { SwapJobHandler } from './models/swapJobHandler';
import { IConfig, IJobManagerConfig, IngestionJobsConfig } from './common/interfaces';

const queueClientFactory = (container: DependencyContainer): QueueClient => {
  const logger = container.resolve<Logger>(SERVICES.LOGGER);
  const config = container.resolve<IConfig>(SERVICES.CONFIG);
  const queueConfig = config.get<IJobManagerConfig>('jobManagement.config');
  const httpRetryConfig = config.get<IHttpRetryConfig>('server.httpRetry');
  return new QueueClient(
    logger,
    queueConfig.jobManagerBaseUrl,
    queueConfig.heartbeat.baseUrl,
    queueConfig.dequeueIntervalMs,
    queueConfig.heartbeat.intervalMs,
    httpRetryConfig
  );
};
export interface RegisterOptions {
  override?: InjectionObject<unknown>[];
  useChild?: boolean;
}

export const registerExternalValues = (options?: RegisterOptions): DependencyContainer => {
  const loggerConfig = config.get<LoggerOptions>('telemetry.logger');
  const logger = jsLogger({ ...loggerConfig, prettyPrint: loggerConfig.prettyPrint, mixin: getOtelMixin() });

  const metrics = new Metrics();
  metrics.start();

  const tracer = trace.getTracer(SERVICE_NAME);

  const ingestionConfig = config.get<IngestionJobsConfig>('jobManagement.ingestion.jobs');

  const handlersTokens = validateAndGetHandlersTokens(ingestionConfig);

  const dependencies: InjectionObject<unknown>[] = [
    { token: SERVICES.CONFIG, provider: { useValue: config } },
    { token: SERVICES.LOGGER, provider: { useValue: logger } },
    { token: SERVICES.TRACER, provider: { useValue: tracer } },
    { token: SERVICES.QUEUE_CLIENT, provider: { useFactory: instancePerContainerCachingFactory(queueClientFactory) } },
    { token: SERVICES.METER, provider: { useValue: OtelMetrics.getMeterProvider().getMeter(SERVICE_NAME) } },
    { token: JOB_HANDLER_FACTORY_SYMBOL, provider: { useFactory: instancePerContainerCachingFactory(jobHandlerFactory) } },
    { token: handlersTokens.Ingestion_New, provider: { useClass: NewJobHandler } },
    { token: handlersTokens.Ingestion_Update, provider: { useClass: UpdateJobHandler } },
    { token: handlersTokens.Ingestion_Swap_Update, provider: { useClass: SwapJobHandler } },
    {
      token: 'onSignal',
      provider: {
        useValue: {
          useValue: async (): Promise<void> => {
            await Promise.all([tracing.stop(), metrics.stop()]);
          },
        },
      },
    },
  ];

  return registerDependencies(dependencies, options?.override, options?.useChild);
};
