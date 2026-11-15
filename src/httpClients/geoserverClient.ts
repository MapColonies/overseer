import type { Logger } from '@map-colonies/js-logger';
import {
  buildPolygonPartsFeatureTypeBody,
  GeoserverFeatureTypesList,
  parseFeatureTypeNames,
  type GeoserverConfiguredFeatureTypesResponse,
  type GeoserverFeatureTypeNamesResponse,
  type LayerNameFormats,
} from '@map-colonies/raster-shared';
import { HttpClient, type IHttpRetryConfig } from '@map-colonies/mc-utils';
import { context, SpanStatusCode, trace, type Tracer } from '@opentelemetry/api';
import { inject, injectable } from 'tsyringe';
import { ConflictError, NotFoundError, UnprocessableEntityError } from '@map-colonies/error-types';
import type { GeoserverConfig, IConfig } from '../common/interfaces';
import { SERVICES } from '../common/constants';
import { DeleteLayerError, PublishLayerError } from '../common/errors';

@injectable()
export class GeoserverClient extends HttpClient {
  private readonly featureTypesUrl: string;
  private readonly auth: GeoserverConfig['auth'];
  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.LOGGER) protected override readonly logger: Logger,
    @inject(SERVICES.TRACER) private readonly tracer: Tracer
  ) {
    const serviceName = 'Geoserver';
    const baseUrl = `${config.get<string>('servicesUrl.geoserver')}/rest`;
    const httpRetryConfig = config.get<IHttpRetryConfig>('httpRetry');
    const disableHttpClientLogs = config.get<boolean>('disableHttpClientLogs');
    super(logger, baseUrl, serviceName, httpRetryConfig, disableHttpClientLogs);
    const { workspace, dataStore, auth } = config.get<GeoserverConfig>('geoserver');
    this.featureTypesUrl = `/workspaces/${workspace}/datastores/${dataStore}/featuretypes`;
    this.auth = auth;
  }

  public async publish(layerNames: LayerNameFormats): Promise<void> {
    await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${GeoserverClient.name}.${this.publish.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();

      const { polygonPartsEntityName, layerName } = layerNames;
      activeSpan?.setAttributes({ polygonPartsEntityName, layerName });

      try {
        // geoserver answers both cases with a generic 500, so check them first to fail with a clear reason
        const tableNames = await this.getFeatureTypeNames(GeoserverFeatureTypesList.ALL);
        if (!tableNames.includes(polygonPartsEntityName)) {
          throw new UnprocessableEntityError(`polygon parts table ${polygonPartsEntityName} does not exist in geoserver data store`);
        }
        const configuredLayerNames = await this.getFeatureTypeNames(GeoserverFeatureTypesList.CONFIGURED);
        if (configuredLayerNames.includes(layerName)) {
          throw new ConflictError(`layer ${layerName} is already configured in geoserver`);
        }

        const publishReq = buildPolygonPartsFeatureTypeBody({ nativeName: polygonPartsEntityName, name: layerName });
        await this.post(this.featureTypesUrl, publishReq, undefined, undefined, this.auth);
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
        const url = `${this.featureTypesUrl}/${layerName}`;
        await this.delete(url, { recurse: true }, undefined, this.auth);
        activeSpan?.setStatus({ code: SpanStatusCode.OK, message: 'Layer unpublished successfully from geoserver' });
      } catch (err) {
        if (err instanceof NotFoundError) {
          // already gone — unpublish is idempotent, a 404 on (re)run is success (§6)
          this.logger.warn({ msg: 'Layer feature type not found in geoserver, skipping', layerName });
          activeSpan?.setStatus({ code: SpanStatusCode.OK, message: 'Layer feature type not found in geoserver, skipping' });
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

  private async getFeatureTypeNames(list: GeoserverFeatureTypesList): Promise<string[]> {
    const response = await this.get<GeoserverConfiguredFeatureTypesResponse | GeoserverFeatureTypeNamesResponse>(
      this.featureTypesUrl,
      { list },
      undefined,
      this.auth
    );
    return parseFeatureTypeNames(response, list);
  }
}
