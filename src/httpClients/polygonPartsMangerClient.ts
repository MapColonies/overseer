import type { IConfig } from 'config';
import type { Logger } from '@map-colonies/js-logger';
import type { AggregationFeature, RoiFeatureCollection } from '@map-colonies/raster-shared';
import type { IHttpRetryConfig } from '@map-colonies/mc-utils';
import { HttpClient } from '@map-colonies/mc-utils';
import { inject, injectable } from 'tsyringe';
import { POLYGON_PARTS_MANAGER_SERVICE_NAME, SERVICES } from '../common/constants';
import { requiredAggregationFeatureSchema } from '../utils/zod/schemas/aggregation.schema';
import { LayerMetadataAggregationError, PolygonPartsProcessingError } from '../common/errors';
import { AggregationLayerMetadata, PolygonPartsProcessPayload } from '../common/interfaces';

@injectable()
export class PolygonPartsMangerClient extends HttpClient {
  public constructor(@inject(SERVICES.CONFIG) private readonly config: IConfig, @inject(SERVICES.LOGGER) protected readonly logger: Logger) {
    const serviceName = POLYGON_PARTS_MANAGER_SERVICE_NAME;
    const baseUrl = config.get<string>('servicesUrl.polygonPartsManager');
    const httpRetryConfig = config.get<IHttpRetryConfig>('httpRetry');
    const disableHttpClientLogs = config.get<boolean>('disableHttpClientLogs');
    super(logger, baseUrl, serviceName, httpRetryConfig, disableHttpClientLogs);
  }

  public async process(payload: PolygonPartsProcessPayload): Promise<void> {
    try {
      const url = '/polygonParts/process';

      this.logger.info({ msg: 'process polygon parts', url, payload });

      await this.put<void>(url, payload);
    } catch (err) {
      const processError = new PolygonPartsProcessingError(err, payload.productId, payload.productType);
      throw processError;
    }
  }

  public async getAggregatedLayerMetadata(polygonPartsEntityName: string, filter?: RoiFeatureCollection): Promise<AggregationLayerMetadata> {
    try {
      this.logger.info({ msg: 'getAggregatedLayerMetadata', polygonPartsEntityName, filter });

      const url = `/polygonParts/${polygonPartsEntityName}/aggregate`;
      const body = {
        filter: filter ?? null,
      };

      const res = await this.post<AggregationFeature>(url, body);
      const aggregatedLayerMetadata = this.validateAndTransformFeatureToAggregationMetadata(res);
      return aggregatedLayerMetadata;
    } catch (err) {
      const aggregationError = new LayerMetadataAggregationError(err, polygonPartsEntityName);
      this.logger.error({ msg: aggregationError.message, polygonPartsEntityName, err });
      throw aggregationError;
    }
  }

  private validateAndTransformFeatureToAggregationMetadata(aggregationFeature: AggregationFeature): AggregationLayerMetadata {
    const validAggregatedFeature = requiredAggregationFeatureSchema.parse(aggregationFeature);
    return { ...validAggregatedFeature.properties, footprint: validAggregatedFeature.geometry };
  }
}
