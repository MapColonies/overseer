import { IConfig } from 'config';
import { Logger } from '@map-colonies/js-logger';
import { TileOutputFormat } from '@map-colonies/mc-model-types';
import { HttpClient, IHttpRetryConfig } from '@map-colonies/mc-utils';
import { inject, injectable } from 'tsyringe';
import { NotFoundError } from '@map-colonies/error-types';
import { PublishedLayerCacheType, SERVICES, storageProviderToCacheTypeMap, TilesStorageProvider } from '../common/constants';
import { IGetMapproxyCacheRequest, IGetMapproxyCacheResponse, IPublishMapLayerRequest } from '../common/interfaces';
import {
  LayerCacheNotFoundError,
  PublishLayerError,
  UnsupportedLayerCacheError,
  UnsupportedStorageProviderError,
  UpdateLayerError,
} from '../common/errors';

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

  public async publish(layerName: string, tilesPath: string, format: TileOutputFormat): Promise<void> {
    const cacheType = this.getCacheType();
    try {
      const publishReq: IPublishMapLayerRequest = {
        name: layerName,
        tilesPath,
        format,
        cacheType,
      };
      const url = '/layer';
      await this.post(url, publishReq);
    } catch (err) {
      if (err instanceof Error) {
        throw new PublishLayerError(this.targetService, layerName, err);
      }
    }
  }

  public async update(layerName: string, tilesPath: string, format: TileOutputFormat): Promise<void> {
    const cacheType = this.getCacheType();

    try {
      const updateReq: IPublishMapLayerRequest = {
        name: layerName,
        tilesPath,
        format,
        cacheType,
      };
      const url = `/layer/${layerName}`;
      await this.put(url, updateReq);
    } catch (err) {
      if (err instanceof Error) {
        throw new UpdateLayerError(this.targetService, layerName, err);
      }
    }
  }

  public async getCacheName(getCacheReq: IGetMapproxyCacheRequest): Promise<string> {
    const url = `layer/${getCacheReq.layerName}/${getCacheReq.cacheType}`;
    try {
      const res = await this.get<IGetMapproxyCacheResponse>(url);
      const { cache, cacheName } = res;
      if (cache.type !== PublishedLayerCacheType.REDIS) {
        throw new UnsupportedLayerCacheError(getCacheReq.layerName, getCacheReq.cacheType);
      }
      return cacheName;
    } catch (err) {
      if (err instanceof NotFoundError) {
        this.logger.warn({ msg: 'Cache not found', layerName: getCacheReq.layerName, cacheType: getCacheReq.cacheType });
        throw new LayerCacheNotFoundError(getCacheReq.layerName, getCacheReq.cacheType);
      }
      throw err;
    }
  }

  private getCacheType(): PublishedLayerCacheType {
    const cacheType = storageProviderToCacheTypeMap.get(this.tilesStorageProvider);
    if (!cacheType) {
      throw new UnsupportedStorageProviderError(this.tilesStorageProvider);
    }
    return cacheType;
  }
}
