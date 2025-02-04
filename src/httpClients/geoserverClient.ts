import type { IConfig } from 'config';
import type { Logger } from '@map-colonies/js-logger';
import { HttpClient } from '@map-colonies/mc-utils';
import type { IHttpRetryConfig } from '@map-colonies/mc-utils';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Tracer } from '@opentelemetry/api';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../common/constants';
import type { InsertGeoserverRequest, LayerNameFormats } from '../common/interfaces';
import { PublishLayerError } from '../common/errors';

@injectable()
export class GeoserverClient extends HttpClient {
  private readonly workspace: string;
  private readonly dataStore: string;
  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.LOGGER) protected readonly logger: Logger,
    @inject(SERVICES.TRACER) private readonly tracer: Tracer
  ) {
    const serviceName = 'GeoserverApi';
    const baseUrl = config.get<string>('servicesUrl.geoserverApi');
    const httpRetryConfig = config.get<IHttpRetryConfig>('httpRetry');
    const disableHttpClientLogs = config.get<boolean>('disableHttpClientLogs');
    super(logger, baseUrl, serviceName, httpRetryConfig, disableHttpClientLogs);
    this.workspace = config.get<string>('geoserver.workspace');
    this.dataStore = config.get<string>('geoserver.dataStore');
  }

  public async publish(layerNames: LayerNameFormats): Promise<void> {
    await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${GeoserverClient.name}.${this.publish.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();

      const { nativeName, layerName } = layerNames;
      activeSpan?.setAttributes({ nativeName, layerName });

      try {
        const url = `/featureTypes/${this.workspace}/${this.dataStore}`;
        const publishReq: InsertGeoserverRequest = {
          nativeName,
          name: layerName,
        };

        await this.post(url, publishReq);
        activeSpan?.setStatus({ code: SpanStatusCode.OK, message: 'Layer published successfully to geoserver' });
      } catch (err) {
        if (err instanceof Error) {
          activeSpan?.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          activeSpan?.recordException(err);
          throw new PublishLayerError(this.targetService, layerName, err);
        }
      } finally {
        activeSpan?.end();
      }
    });
  }
}
