/* eslint-disable @typescript-eslint/naming-convention */
import type { Logger, LoggerOptions } from '@map-colonies/js-logger';
import jsLogger from '@map-colonies/js-logger';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import type { IHttpRetryConfig } from '@map-colonies/mc-utils';
import { TileRanger } from '@map-colonies/mc-utils';
import { getOtelMixin } from '@map-colonies/telemetry';
import { trace } from '@opentelemetry/api';
import config from 'config';
import { Registry } from 'prom-client';
import { instanceCachingFactory, instancePerContainerCachingFactory } from 'tsyringe';
import type { DependencyContainer } from 'tsyringe/dist/typings/types';
import { SERVICES, SERVICE_NAME, SERVICE_VERSION } from './common/constants';
import { InjectionObject, registerDependencies } from './common/dependencyRegistration';
import { IConfig, IS3Config, JobManagerConfig, type JobManagementConfig } from './common/interfaces';
import { tracing } from './common/tracing';
import { ExportJobHandler } from './job/models/export/exportJobHandler';
import { NewJobHandler } from './job/models/ingestion/newJobHandler';
import { SwapJobHandler } from './job/models/ingestion/swapJobHandler';
import { UpdateJobHandler } from './job/models/ingestion/updateJobHandler';
import { JOB_HANDLER_FACTORY_SYMBOL, jobHandlerFactory } from './job/models/jobHandlerFactory';
import { getPollingJobs, parseInstanceType, validateAndGetHandlersTokens } from './utils/configUtil';
import { InstanceType } from './utils/zod/schemas/instance.schema';

const registerInstanceHandlers = (instanceType: InstanceType, handlersTokens: Record<string, string>): InjectionObject<unknown>[] => {
  switch (instanceType) {
    case 'ingestion':
      return [
        { token: handlersTokens.Ingestion_New, provider: { useClass: NewJobHandler } },
        { token: handlersTokens.Ingestion_Update, provider: { useClass: UpdateJobHandler } },
        { token: handlersTokens.Ingestion_Swap_Update, provider: { useClass: SwapJobHandler } },
      ];
    case 'export':
      return [{ token: handlersTokens.Export, provider: { useClass: ExportJobHandler } }];
  }
};

const registerInstanceDependencies = (instanceType: InstanceType): InjectionObject<unknown>[] => {
  switch (instanceType) {
    case 'ingestion':
      return [{ token: SERVICES.TILE_RANGER, provider: { useClass: TileRanger } }];
    case 'export': {
      const s3Config = config.get<IS3Config>('S3');
      return [{ token: SERVICES.S3CONFIG, provider: { useValue: s3Config } }];
    }
  }
};

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

  const instanceType = parseInstanceType(config.get<InstanceType>('instanceType'));
  const jobManagementConfig = config.get<JobManagementConfig>('jobManagement');
  const pollingJobs = getPollingJobs(jobManagementConfig, instanceType);
  const handlersTokens = validateAndGetHandlersTokens(pollingJobs, instanceType);

  const dependencies: InjectionObject<unknown>[] = [
    { token: SERVICES.CONFIG, provider: { useValue: config } },
    { token: SERVICES.LOGGER, provider: { useValue: logger } },
    { token: SERVICES.TRACER, provider: { useValue: tracer } },
    { token: SERVICES.INSTANCE_TYPE, provider: { useValue: instanceType } },
    { token: SERVICES.QUEUE_CLIENT, provider: { useFactory: instancePerContainerCachingFactory(queueClientFactory) } },
    { token: JOB_HANDLER_FACTORY_SYMBOL, provider: { useFactory: instancePerContainerCachingFactory(jobHandlerFactory) } },
    ...registerInstanceHandlers(instanceType, handlersTokens),
    ...registerInstanceDependencies(instanceType),
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
