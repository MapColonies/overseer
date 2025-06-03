import jsLogger from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { container, instancePerContainerCachingFactory } from 'tsyringe';
import { SERVICES } from '../../src/common/constants';
import { JOB_HANDLER_FACTORY_SYMBOL, jobHandlerFactory } from '../../src/job/models/jobHandlerFactory';
import { configMock, init as initConfig } from '../unit/mocks/configMock';
import {queueClientFactory} from '../../src/queueClient/queueClientFactory';

export function registerTestValues(): void {
  initConfig();
  container.register(SERVICES.CONFIG, { useValue: configMock });
  container.register(SERVICES.LOGGER, { useValue: jsLogger({ enabled: false }) });
  container.register(SERVICES.TRACER, { useValue: trace.getTracer('testTracer') });
  container.register(JOB_HANDLER_FACTORY_SYMBOL, { useFactory: instancePerContainerCachingFactory(jobHandlerFactory) });
  container.register(SERVICES.QUEUE_CLIENT, { useFactory: instancePerContainerCachingFactory(queueClientFactory) });
}
