import { IConfig } from 'config';
import { Logger } from '@map-colonies/js-logger';
import { HttpClient, IHttpRetryConfig } from '@map-colonies/mc-utils';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../common/constants';
import { IInsertGeoserverRequest } from '../common/interfaces';
import { PublishLayerError } from '../common/errors';

@injectable()
export class GeoserverClient extends HttpClient {
  private readonly workspace: string;
  private readonly dataStore: string;
  public constructor(@inject(SERVICES.CONFIG) private readonly config: IConfig, @inject(SERVICES.LOGGER) protected readonly logger: Logger) {
    const serviceName = 'GeoserverApi';
    const baseUrl = config.get<string>('servicesUrl.geoserverApi');
    const httpRetryConfig = config.get<IHttpRetryConfig>('httpRetry');
    const disableHttpClientLogs = config.get<boolean>('disableHttpClientLogs');
    super(logger, baseUrl, serviceName, httpRetryConfig, disableHttpClientLogs);
    this.workspace = config.get<string>('geoserver.workspace');
    this.dataStore = config.get<string>('geoserver.dataStore');
  }

  public async publish(layerName: string): Promise<void> {
    try {
      const url = `/featureTypes/${this.workspace}/${this.dataStore}`;
      const publishReq: IInsertGeoserverRequest = {
        nativeName: layerName,
      };

      await this.post(url, publishReq);
    } catch (err) {
      if (err instanceof Error) {
        throw new PublishLayerError(this.targetService, layerName, err);
      }
    }
  }
}
