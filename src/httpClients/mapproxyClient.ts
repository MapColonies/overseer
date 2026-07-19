import type { Logger } from '@map-colonies/js-logger';
import type { LayerName, TileOutputFormat } from '@map-colonies/raster-shared';
import { context, SpanStatusCode, trace, type Tracer } from '@opentelemetry/api';
import { HttpClient, type IHttpRetryConfig } from '@map-colonies/mc-utils';
import { inject, injectable } from 'tsyringe';
import { NotFoundError } from '@map-colonies/error-types';
import type { IConfig, GetMapproxyCacheRequest, GetMapproxyCacheResponse, PublishMapLayerRequest } from '../common/interfaces';
import { LayerCacheType, SERVICES, storageProviderToCacheTypeMap, StorageProvider } from '../common/constants';
import {
  DeleteLayerError,
  LayerCacheNotFoundError,
  PublishLayerError,
  UnsupportedLayerCacheError,
  UnsupportedStorageProviderError,
  UpdateLayerError,
} from '../common/errors';

@injectable()
export class MapproxyApiClient extends HttpClient {
  private readonly tilesStorageProvider: StorageProvider;
  private readonly layerCacheType: LayerCacheType;
  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.LOGGER) protected override readonly logger: Logger,
    @inject(SERVICES.TRACER) private readonly tracer: Tracer
  ) {
    const serviceName = 'MapproxyApi';
    const baseUrl = config.get<string>('servicesUrl.mapproxyApi');
    const httpRetryConfig = config.get<IHttpRetryConfig>('httpRetry');
    const disableHttpClientLogs = config.get<boolean>('disableHttpClientLogs');
    super(logger, baseUrl, serviceName, httpRetryConfig, disableHttpClientLogs);
    this.tilesStorageProvider = config.get<StorageProvider>('tilesStorageProvider');
    this.layerCacheType = this.getCacheType();
  }

  public async publish(layerName: string, tilesPath: string, format: TileOutputFormat): Promise<void> {
    await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${MapproxyApiClient.name}.${this.publish.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();
      const cacheType = this.layerCacheType;

      activeSpan?.setAttributes({ layerName, tilesPath, format, cacheType });

      try {
        const publishReq: PublishMapLayerRequest = {
          name: layerName,
          tilesPath,
          format,
          cacheType,
        };
        const url = '/layer';
        await this.post(url, publishReq);
        activeSpan?.setStatus({ code: SpanStatusCode.OK, message: 'Layer published successfully' });
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

  public async update(layerName: string, tilesPath: string, format: TileOutputFormat): Promise<void> {
    await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${MapproxyApiClient.name}.${this.update.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();
      const cacheType = this.layerCacheType;

      activeSpan?.setAttributes({ layerName, tilesPath, format, cacheType });

      try {
        const updateReq: PublishMapLayerRequest = {
          name: layerName,
          tilesPath,
          format,
          cacheType,
        };
        const url = `/layer/${layerName}`;

        activeSpan?.addEvent('updateLayer');
        await this.put(url, updateReq);
        activeSpan?.setStatus({ code: SpanStatusCode.OK, message: 'Layer updated successfully' });
      } catch (err) {
        if (err instanceof Error) {
          activeSpan?.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          activeSpan?.recordException(err);
          throw new UpdateLayerError(this.targetService, layerName, err);
        }
      } finally {
        activeSpan?.end();
      }
    });
  }

  public async removeLayer(layerName: string): Promise<void> {
    await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${MapproxyApiClient.name}.${this.removeLayer.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();
      activeSpan?.setAttribute('layerName', layerName);

      try {
        const failed = await this.delete<string[]>('/layer', { layerNames: [layerName] });
        if (failed.includes(layerName)) {
          throw new DeleteLayerError(this.targetService, layerName, new Error(`mapproxy reported layer as failed to remove`));
        }
        activeSpan?.setStatus({ code: SpanStatusCode.OK, message: 'Layer removed successfully from mapproxy' });
      } catch (err) {
        if (err instanceof NotFoundError) {
          this.logger.warn({ msg: 'layer not found in mapproxy, skipping', layerName });
          activeSpan?.setStatus({ code: SpanStatusCode.OK, message: 'layer not found in mapproxy, skipping' });
          return;
        }
        if (err instanceof Error) {
          activeSpan?.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          activeSpan?.recordException(err);
          throw err instanceof DeleteLayerError ? err : new DeleteLayerError(this.targetService, layerName, err);
        }
      } finally {
        activeSpan?.end();
      }
    });
  }

  public async getLayerCache(layerName: LayerName): Promise<GetMapproxyCacheResponse | undefined> {
    return this.fetchLayerCache(layerName, this.layerCacheType);
  }

  public async getRedisCacheName(getCacheReq: GetMapproxyCacheRequest): Promise<string> {
    const { layerName, cacheType } = getCacheReq;
    const res = await this.fetchLayerCache(layerName, cacheType);
    if (res === undefined) {
      throw new LayerCacheNotFoundError(layerName, cacheType);
    }
    if (res.cache.type !== LayerCacheType.REDIS) {
      throw new UnsupportedLayerCacheError(layerName, cacheType);
    }
    return res.cacheName;
  }

  private async fetchLayerCache(layerName: LayerName, cacheType: LayerCacheType): Promise<GetMapproxyCacheResponse | undefined> {
    const url = `layer/${layerName}/${cacheType}`;
    try {
      return await this.get<GetMapproxyCacheResponse>(url);
    } catch (err) {
      if (err instanceof NotFoundError) {
        this.logger.warn({ msg: 'layer cache not found in mapproxy', layerName, cacheType });
        return undefined;
      }
      throw err;
    }
  }

  private getCacheType(): LayerCacheType {
    const cacheType = storageProviderToCacheTypeMap.get(this.tilesStorageProvider);
    if (!cacheType) {
      throw new UnsupportedStorageProviderError(this.tilesStorageProvider);
    }
    return cacheType;
  }
}
