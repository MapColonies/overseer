import { Tracing } from '@map-colonies/telemetry';
import { context, Span, trace } from '@opentelemetry/api';
import { IGNORED_INCOMING_TRACE_ROUTES, IGNORED_OUTGOING_TRACE_ROUTES, SERVICE_NAME } from './constants';

/* eslint-disable @typescript-eslint/naming-convention */
const tracing = new Tracing({
  autoInstrumentationsConfigMap: {
    '@opentelemetry/instrumentation-http': {
      requireParentforOutgoingSpans: true,
      ignoreIncomingRequestHook: (request): boolean =>
        IGNORED_INCOMING_TRACE_ROUTES.some((route) => request.url !== undefined && route.test(request.url)),
      ignoreOutgoingRequestHook: (request): boolean =>
        IGNORED_OUTGOING_TRACE_ROUTES.some((route) => typeof request.path === 'string' && route.test(request.path)),
    },
    '@opentelemetry/instrumentation-fs': {
      requireParentSpan: true,
    },
    '@opentelemetry/instrumentation-express': {
      enabled: false,
    },
  },
});
/* eslint-enable @typescript-eslint/naming-convention */

tracing.start();

const createChildSpan = (name: string, parentSpan: Span | undefined): Span => {
  const ctx = parentSpan ? trace.setSpan(context.active(), parentSpan) : context.active();
  return trace.getTracer(SERVICE_NAME).startSpan(name, undefined, ctx);
};

export { tracing, createChildSpan };
