import jsLogger from '@map-colonies/js-logger';
import { container, instancePerContainerCachingFactory } from 'tsyringe';
import { trace } from '@opentelemetry/api';
import { InjectionObject } from '../../../src/common/dependencyRegistration';
import { configMock, getMock, hasMock, registerDefaultConfig } from '../../unit/mocks/configMock';
import { IngestionJobsConfig } from '../../../src/common/interfaces';
import { validateAndGetHandlersTokens } from '../../../src/utils/configUtil';
import { SERVICES } from '../../../src/common/constants';
import { JOB_HANDLER_FACTORY_SYMBOL, jobHandlerFactory } from '../../../src/models/jobHandlerFactory';
import { queueClientFactory } from '../../../src/containerConfig';
import { NewJobHandler } from '../../../src/models/newJobHandler';
import { UpdateJobHandler } from '../../../src/models/updateJobHandler';
import { SwapJobHandler } from '../../../src/models/swapJobHandler';

function getTestContainerConfig(): InjectionObject<unknown>[] {
  registerDefaultConfig();

  const ingestionConfig = configMock.get<IngestionJobsConfig>('jobManagement.ingestion.jobs');

  const handlersTokens = validateAndGetHandlersTokens(ingestionConfig);

  return [
    { token: SERVICES.LOGGER, provider: { useValue: jsLogger({ enabled: false }) } },
    { token: SERVICES.CONFIG, provider: { useValue: configMock } },
    { token: SERVICES.TRACER, provider: { useValue: trace.getTracer('testTracer') } },
    { token: SERVICES.QUEUE_CLIENT, provider: { useFactory: instancePerContainerCachingFactory(queueClientFactory) } },
    { token: JOB_HANDLER_FACTORY_SYMBOL, provider: { useFactory: instancePerContainerCachingFactory(jobHandlerFactory) } },
    { token: handlersTokens.Ingestion_New, provider: { useClass: NewJobHandler } },
    { token: handlersTokens.Ingestion_Update, provider: { useClass: UpdateJobHandler } },
    { token: handlersTokens.Ingestion_Swap_Update, provider: { useClass: SwapJobHandler } },
  ];
}

const resetContainer = (clearInstances = true): void => {
  if (clearInstances) {
    container.clearInstances();
  }

  getMock.mockReset();
  hasMock.mockReset();
};

export { getTestContainerConfig, resetContainer };
