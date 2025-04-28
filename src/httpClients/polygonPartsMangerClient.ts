import type { IConfig } from 'config';
import type { Logger } from '@map-colonies/js-logger';
import type { AggregationFeature, RoiFeatureCollection } from '@map-colonies/raster-shared';
import type { IHttpRetryConfig } from '@map-colonies/mc-utils';
import { HttpClient } from '@map-colonies/mc-utils';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../common/constants';
import { requiredAggregationFeatureSchema } from '../utils/zod/schemas/aggregation.schema';
import { LayerMetadataAggregationError } from '../common/errors';
import { AggregationLayerMetadata } from '../common/interfaces';

@injectable()
export class PolygonPartsMangerClient extends HttpClient {
  public constructor(@inject(SERVICES.CONFIG) private readonly config: IConfig, @inject(SERVICES.LOGGER) protected readonly logger: Logger) {
    const serviceName = 'PolygonPartManger';
    const baseUrl = config.get<string>('servicesUrl.polygonPartsManager');
    const httpRetryConfig = config.get<IHttpRetryConfig>('httpRetry');
    const disableHttpClientLogs = config.get<boolean>('disableHttpClientLogs');
    super(logger, baseUrl, serviceName, httpRetryConfig, disableHttpClientLogs);
  }

  public async getAggregatedLayerMetadata(polygonPartsEntityName: string, filter?: RoiFeatureCollection): Promise<AggregationLayerMetadata> {
    try {
      const url = `${polygonPartsEntityName}/aggregate`;
      const res = await this.post<AggregationFeature>(url, filter);
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
