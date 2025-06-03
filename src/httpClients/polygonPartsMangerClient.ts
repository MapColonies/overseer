import type { Logger } from '@map-colonies/js-logger';
import type { IHttpRetryConfig } from '@map-colonies/mc-utils';
import { HttpClient } from '@map-colonies/mc-utils';
import type { AggregationFeature, RoiFeatureCollection } from '@map-colonies/raster-shared';
import type { IConfig } from 'config';
import type { FeatureCollection, Polygon } from 'geojson';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../common/constants';
import { FindPolygonPartsError, LayerMetadataAggregationError } from '../common/errors';
import type { AggregationLayerMetadata } from '../common/interfaces';
import {
  polygonPartsFindResponseSchema,
  requiredAggregationFeatureSchema,
  type PolygonPartsFindResponseFeatureProperties,
} from '../utils/zod/schemas/polygonParts.schema';

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
      this.logger.info({ msg: 'getAggregatedLayerMetadata', polygonPartsEntityName, filter });

      const url = `polygonParts/${polygonPartsEntityName}/aggregate`;
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

  public async find(
    polygonPartsEntityName: string,
    filter?: RoiFeatureCollection
  ): Promise<FeatureCollection<Polygon, PolygonPartsFindResponseFeatureProperties>> {
    try {
      this.logger.info({ msg: 'find', polygonPartsEntityName, filter });

      const url = `polygonParts/${polygonPartsEntityName}/find`;
      const body = {
        filter: filter ?? null,
      };

      const res = await this.post<unknown>(url, body);
      const validFindReponse = this.validateFindResponse(res);
      return validFindReponse;
    } catch (err) {
      const findError = new FindPolygonPartsError(err, polygonPartsEntityName);
      this.logger.error({ msg: findError.message, polygonPartsEntityName, err });
      throw findError;
    }
  }

  private validateAndTransformFeatureToAggregationMetadata(aggregationFeature: AggregationFeature): AggregationLayerMetadata {
    const validAggregatedFeature = requiredAggregationFeatureSchema.parse(aggregationFeature);
    return { ...validAggregatedFeature.properties, footprint: validAggregatedFeature.geometry };
  }

  private validateFindResponse(findResponse: unknown): FeatureCollection<Polygon, PolygonPartsFindResponseFeatureProperties> {
    const validFindFeatureCollection = polygonPartsFindResponseSchema.parse(findResponse);
    return validFindFeatureCollection;
  }
}
