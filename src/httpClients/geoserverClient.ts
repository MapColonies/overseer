import type { Logger } from '@map-colonies/js-logger';
import type { LayerNameFormats } from '@map-colonies/raster-shared';
import { HttpClient, type IHttpRetryConfig } from '@map-colonies/mc-utils';
import { context, SpanStatusCode, trace, type Tracer } from '@opentelemetry/api';
import { inject, injectable } from 'tsyringe';
import { NotFoundError } from '@map-colonies/error-types';
import type { IConfig, InsertGeoserverRequest } from '../common/interfaces';
import { SERVICES } from '../common/constants';
import { DeleteLayerError, PublishLayerError } from '../common/errors';

@injectable()
export class GeoserverClient extends HttpClient {
  private readonly workspace: string;
  private readonly dataStore: string;
  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.LOGGER) protected override readonly logger: Logger,
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

      const { polygonPartsEntityName, layerName } = layerNames;
      activeSpan?.setAttributes({ polygonPartsEntityName, layerName });

      try {
        const url = `/featureTypes/${this.workspace}/${this.dataStore}`;
        const publishReq: InsertGeoserverRequest = {
          nativeName: polygonPartsEntityName,
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

  public async unpublishLayer(layerName: string): Promise<void> {
    await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${GeoserverClient.name}.${this.unpublishLayer.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();
      activeSpan?.setAttribute('layerName', layerName);

      try {
        const url = `/featureTypes/${this.workspace}/${this.dataStore}/${layerName}`;
        await this.delete(url);
        activeSpan?.setStatus({ code: SpanStatusCode.OK, message: 'Layer unpublished successfully from geoserver' });
      } catch (err) {
        if (err instanceof NotFoundError) {
          // already gone — unpublish is idempotent, a 404 on (re)run is success (§6)
          this.logger.warn({ msg: 'Layer feature type not found in geoserver, treating as already unpublished', layerName });
          activeSpan?.setStatus({ code: SpanStatusCode.OK, message: 'Layer already absent in geoserver' });
          return;
        }
        if (err instanceof Error) {
          activeSpan?.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          activeSpan?.recordException(err);
          throw new DeleteLayerError(this.targetService, layerName, err);
        }
      } finally {
        activeSpan?.end();
      }
    });
  }
}
