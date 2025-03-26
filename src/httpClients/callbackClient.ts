import type { IConfig } from 'config';
import type { Logger } from '@map-colonies/js-logger';
import type { CallbackExportResponse } from '@map-colonies/raster-shared';
import type { IHttpRetryConfig } from '@map-colonies/mc-utils';
import { HttpClient } from '@map-colonies/mc-utils';
import { inject, injectable } from 'tsyringe';
import { context, trace, Tracer, SpanStatusCode } from '@opentelemetry/api';
import { SERVICES } from '../common/constants';

@injectable()
export class CallbackClient extends HttpClient {
  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.LOGGER) protected readonly logger: Logger,
    @inject(SERVICES.TRACER) private readonly tracer: Tracer
  ) {
    const serviceName = 'RequestCallback';
    const baseUrl = ''; // base url is empty because the callback client is used to call the callback url
    const httpRetryConfig = config.get<IHttpRetryConfig>('httpRetry');
    const disableHttpClientLogs = config.get<boolean>('disableHttpClientLogs');
    super(logger, baseUrl, serviceName, httpRetryConfig, disableHttpClientLogs);
  }

  public async send(callbackUrl: string, data: CallbackExportResponse): Promise<void> {
    return context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${CallbackClient.name}.send`)), async () => {
      const activeSpan = trace.getActiveSpan();
      try {
        const monitorAttributes = {
          callbackUrl,
          callbackStatus: data.status,
          ...data,
        };
        activeSpan?.setAttributes({ metadata: JSON.stringify(monitorAttributes) });

        this.logger.info({ msg: 'Sending callback', ...monitorAttributes });
        activeSpan?.addEvent('callback.sending');

        await this.post(callbackUrl, data);

        activeSpan?.addEvent('callback.sent.success');
        this.logger.info({ msg: 'Callback sent successfully', callbackUrl });
      } catch (err) {
        this.logger.error({ msg: 'Failed to send callback', error: err });
        activeSpan?.recordException(err as Error);
        activeSpan?.setStatus({
          code: SpanStatusCode.ERROR,
          message: `Failed to send callback: ${(err as Error).message}`,
        });
        throw err;
      } finally {
        activeSpan?.end();
      }
    });
  }
}
