import { trace } from '@opentelemetry/api';

export const tracerMock = trace.getTracer('test');
