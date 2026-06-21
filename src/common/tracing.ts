import { Tracing } from '@map-colonies/tracing';
import { context, trace, type Span } from '@opentelemetry/api';
import { IGNORED_INCOMING_TRACE_ROUTES, IGNORED_OUTGOING_TRACE_ROUTES, SERVICE_NAME } from './constants';

let tracing: Tracing | undefined;

function tracingFactory(options: ConstructorParameters<typeof Tracing>[0]): Tracing {
  tracing = new Tracing({
    ...options,
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
  return tracing;
}

function getTracing(): Tracing {
  if (!tracing) {
    throw new Error('tracing not initialized');
  }
  return tracing;
}

const createChildSpan = (name: string, parentSpan: Span | undefined): Span => {
  const ctx = parentSpan ? trace.setSpan(context.active(), parentSpan) : context.active();
  return trace.getTracer(SERVICE_NAME).startSpan(name, undefined, ctx);
};

export { createChildSpan, tracingFactory, getTracing };
