import { IConfig } from 'config';
import { Logger } from '@map-colonies/js-logger';
import { HttpClient, IHttpRetryConfig } from '@map-colonies/mc-utils';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../common/constants';
import { IInsertGeoserverRequest } from '../common/interfaces';

@injectable()
export class GeoserverClient extends HttpClient {
  public constructor(@inject(SERVICES.CONFIG) private readonly config: IConfig, @inject(SERVICES.LOGGER) protected readonly logger: Logger) {
    const serviceName = 'GeoserverApi';
    const baseUrl = config.get<string>('servicesUrl.geoserverApi');
    const httpRetryConfig = config.get<IHttpRetryConfig>('httpRetry');
    const disableHttpClientLogs = config.get<boolean>('disableHttpClientLogs');
    super(logger, baseUrl, serviceName, httpRetryConfig, disableHttpClientLogs);
  }

  public async publishLayer(layerName: string): Promise<void> {
    const url = '/workspace';
    const publishReq: IInsertGeoserverRequest = {
      name: layerName,
    };
    await this.post(url, publishReq);
  }
}
