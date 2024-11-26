import { IConfig } from 'config';
import { Logger } from '@map-colonies/js-logger';
import { AggregationLayerMetadata } from '@map-colonies/mc-model-types';
import { HttpClient, IHttpRetryConfig } from '@map-colonies/mc-utils';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../common/constants';

@injectable()
export class PolygonPartsMangerClient extends HttpClient {
  public constructor(@inject(SERVICES.CONFIG) private readonly config: IConfig, @inject(SERVICES.LOGGER) protected readonly logger: Logger) {
    const serviceName = 'PolygonPartManger';
    const baseUrl = config.get<string>('servicesUrl.polygonPartsManager');
    const httpRetryConfig = config.get<IHttpRetryConfig>('httpRetry');
    const disableHttpClientLogs = config.get<boolean>('disableHttpClientLogs');
    super(logger, baseUrl, serviceName, httpRetryConfig, disableHttpClientLogs);
  }

  public async getAggregatedPartData(catalogId: string): Promise<AggregationLayerMetadata> {
    const url = `aggregation/${catalogId}`;
    const res = await this.get<AggregationLayerMetadata>(url);
    return res;
  }
}
