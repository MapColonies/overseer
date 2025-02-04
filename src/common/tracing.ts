import { Tracing } from '@map-colonies/telemetry';
import type { Span } from '@opentelemetry/api';
import { context, trace } from '@opentelemetry/api';
import { IGNORED_INCOMING_TRACE_ROUTES, IGNORED_OUTGOING_TRACE_ROUTES, SERVICE_NAME } from './constants';

/* eslint-disable @typescript-eslint/naming-convention */
const tracing = new Tracing({
  autoInstrumentationsConfigMap: {
    '@opentelemetry/instrumentation-http': {
      requireParentforOutgoingSpans: true, //  Ensures HTTP calls must have a parent span to be traced
      ignoreIncomingRequestHook: (request): boolean =>
        IGNORED_INCOMING_TRACE_ROUTES.some((route) => request.url !== undefined && route.test(request.url)),
      ignoreOutgoingRequestHook: (request): boolean =>
        IGNORED_OUTGOING_TRACE_ROUTES.some((route) => typeof request.path === 'string' && route.test(request.path)),
    },
    '@opentelemetry/instrumentation-fs': {
      requireParentSpan: true, // Ensures FS operations must have a parent span to be traced
    },
    '@opentelemetry/instrumentation-express': {
      enabled: false, // Express instrumentation is disabled since this is a worker service without HTTP routes
    },
  },
});
// This configuration ensures we only trace operations that are part of actual worker tasks, reducing noise from standalone operations.
/* eslint-enable @typescript-eslint/naming-convention */

tracing.start();

const createChildSpan = (name: string, parentSpan: Span | undefined): Span => {
  const ctx = parentSpan ? trace.setSpan(context.active(), parentSpan) : context.active();
  return trace.getTracer(SERVICE_NAME).startSpan(name, undefined, ctx);
};

export { tracing, createChildSpan };
