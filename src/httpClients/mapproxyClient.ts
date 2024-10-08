import { IConfig } from 'config';
import { Logger } from '@map-colonies/js-logger';
import { TileOutputFormat } from '@map-colonies/mc-model-types';
import { HttpClient, IHttpRetryConfig } from '@map-colonies/mc-utils';
import { inject, injectable } from 'tsyringe';
import { SERVICES, storageProviderToCacheTypeMap, TilesStorageProvider } from '../common/constants';
import { IPublishMapLayerRequest } from '../common/interfaces';

@injectable()
export class MapproxyApiClient extends HttpClient {
  private readonly tilesStorageProvider: TilesStorageProvider;
  public constructor(@inject(SERVICES.CONFIG) private readonly config: IConfig, @inject(SERVICES.LOGGER) protected readonly logger: Logger) {
    const serviceName = 'MapproxyApi';
    const baseUrl = config.get<string>('servicesUrl.mapproxyApi');
    const httpRetryConfig = config.get<IHttpRetryConfig>('httpRetry');
    const disableHttpClientLogs = config.get<boolean>('disableHttpClientLogs');
    super(logger, baseUrl, serviceName, httpRetryConfig, disableHttpClientLogs);
    this.tilesStorageProvider = config.get<TilesStorageProvider>('tilesStorageProvider');
  }

  public async publishLayer(layerName: string, tilesPath: string, format: TileOutputFormat): Promise<void> {
    const cacheType = storageProviderToCacheTypeMap.get(this.tilesStorageProvider);

    if (!cacheType) {
      throw new Error(`Unsupported storage provider: ${this.tilesStorageProvider}`);
    }

    const publishReq: IPublishMapLayerRequest = {
      name: layerName,
      tilesPath,
      format,
      cacheType,
    };
    const url = '/layer';
    await this.post(url, publishReq);
  }
}
