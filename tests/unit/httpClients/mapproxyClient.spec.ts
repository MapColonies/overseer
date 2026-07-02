import nock from 'nock';
import type { Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { LayerName } from '@map-colonies/raster-shared';
import { TileOutputFormat } from '@map-colonies/raster-shared';
import { getTestLogger } from '../../configurations/testLogger';
import { MapproxyApiClient } from '../../../src/httpClients/mapproxyClient';
import { configMock, init as InitConfig, setValue, registerDefaultConfig } from '../mocks/configMock';
import {
  DeleteLayerError,
  LayerCacheNotFoundError,
  PublishLayerError,
  UnsupportedLayerCacheError,
  UnsupportedStorageProviderError,
  UpdateLayerError,
} from '../../../src/common/errors';
import { LayerCacheType } from '../../../src/common/constants';

describe('mapproxyClient', () => {
  let mapproxyApiClient: MapproxyApiClient;
  let tracerMock: Tracer;

  beforeEach(async () => {
    tracerMock = trace.getTracer('test');
    InitConfig();
    registerDefaultConfig();
    setValue('tilesStorageProvider', 'FS');
    mapproxyApiClient = new MapproxyApiClient(configMock, await getTestLogger(), tracerMock);
  });

  afterEach(() => {
    // eslint-disable-next-line import-x/no-named-as-default-member
    nock.cleanAll();
    vi.resetAllMocks();
  });

  describe('publish', () => {
    it('should publish a layer to mapproxy', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.mapproxyApi');
      const layerName = 'testLayer';
      const layerRelativePath = 'testLayerPath';
      const tileOutputFormat = TileOutputFormat.PNG;

      nock(baseUrl).post('/layer').reply(201);

      const action = mapproxyApiClient.publish(layerName, layerRelativePath, tileOutputFormat);

      await expect(action).resolves.not.toThrow();
      // eslint-disable-next-line import-x/no-named-as-default-member
      expect(nock.isDone()).toBe(true);
    });

    it('should throw an error for unsupported storage provider', async () => {
      setValue('tilesStorageProvider', 'unsupported');

      try {
        mapproxyApiClient = new MapproxyApiClient(configMock, await getTestLogger(), tracerMock);
      } catch (err) {
        // eslint-disable-next-line vitest/no-conditional-expect
        expect(err).toBeInstanceOf(UnsupportedStorageProviderError);
      }
    });

    it('should throw an PublishLayerError when mapproxyApi client returns an error', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.mapproxyApi');
      const layerName = 'errorTestLayer';
      const layerRelativePath = 'errorTestLayerPath';
      const tileOutputFormat = TileOutputFormat.PNG;

      nock(baseUrl).post('/layer').reply(500);

      const action = mapproxyApiClient.publish(layerName, layerRelativePath, tileOutputFormat);

      await expect(action).rejects.toThrow(PublishLayerError);
    });
  });

  describe('update', () => {
    it('should update a layer in mapproxy', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.mapproxyApi');
      const layerName = 'test-layer';
      const layerRelativePath = 'bfa79f98-79af-44b2-8acd-6dc1ebb9fd1c/c3959032-c6df-41ba-945a-80633510123a';
      const tileOutputFormat = TileOutputFormat.PNG;

      nock(baseUrl).put(`/layer/${layerName}`).reply(200);

      const action = mapproxyApiClient.update(layerName, layerRelativePath, tileOutputFormat);

      await expect(action).resolves.not.toThrow();
      // eslint-disable-next-line import-x/no-named-as-default-member
      expect(nock.isDone()).toBe(true);
    });

    it('should throw an error for unsupported storage provider', async () => {
      setValue('tilesStorageProvider', 'unsupported');
      try {
        mapproxyApiClient = new MapproxyApiClient(configMock, await getTestLogger(), tracerMock);
      } catch (err) {
        // eslint-disable-next-line vitest/no-conditional-expect
        expect(err).toBeInstanceOf(UnsupportedStorageProviderError);
      }
    });

    it('should throw an PublishLayerError when mapproxyApi client returns an error', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.mapproxyApi');
      const layerName = 'errorTest-Layer';
      const layerRelativePath = 'bfa79f98-79af-44b2-8acd-6dc1ebb9fd1c/c3959032-c6df-41ba-945a-80633510123a';
      const tileOutputFormat = TileOutputFormat.PNG;

      nock(baseUrl).put(`/layer/${layerName}`).reply(500);

      const action = mapproxyApiClient.update(layerName, layerRelativePath, tileOutputFormat);

      await expect(action).rejects.toThrow(UpdateLayerError);
    });
  });

  describe('getCacheName', () => {
    it('should get cache name from mapproxy', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.mapproxyApi');
      const layerName: LayerName = 'test-Orthophoto';
      const cacheType = LayerCacheType.REDIS;
      const cacheName = 'cacheName';

      nock(baseUrl)
        .get(`/layer/${layerName}/${cacheType}`)
        .reply(200, { cacheName, cache: { type: cacheType } });

      const action = mapproxyApiClient.getCacheName({ layerName, cacheType });

      await expect(action).resolves.not.toThrow();
      // eslint-disable-next-line import-x/no-named-as-default-member
      expect(nock.isDone()).toBe(true);
      await expect(action).resolves.toBe(cacheName);
    });

    it('should throw an error for unsupported layer cache type', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.mapproxyApi');
      const layerName: LayerName = 'test-Orthophoto';
      const cacheType = LayerCacheType.FS;
      const cacheName = 'cacheName';

      nock(baseUrl)
        .get(`/layer/${layerName}/${cacheType}`)
        .reply(200, { cacheName, cache: { type: cacheType } });

      const action = mapproxyApiClient.getCacheName({ layerName, cacheType });

      await expect(action).rejects.toThrow(UnsupportedLayerCacheError);
    });

    it('should throw an LayerCacheNotFoundError when mapproxyApi client returns an error', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.mapproxyApi');
      const layerName: LayerName = 'not_found-Orthophoto';
      const cacheType = LayerCacheType.REDIS;

      nock(baseUrl).get(`/layer/${layerName}/${cacheType}`).reply(404);

      const action = mapproxyApiClient.getCacheName({ layerName, cacheType });

      await expect(action).rejects.toThrow(LayerCacheNotFoundError);
    });
  });

  describe('getS3CacheBucketName', () => {
    it('should return the bucket name of the layer s3 cache', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.mapproxyApi');
      const layerName: LayerName = 'test-Orthophoto';
      const bucketName = 'raster-tiles-bucket';

      nock(baseUrl)
        .get(`/layer/${layerName}/${LayerCacheType.S3}`)
        // eslint-disable-next-line @typescript-eslint/naming-convention
        .reply(200, { cacheName: 'cacheName', cache: { type: LayerCacheType.S3, bucket_name: bucketName } });

      const action = mapproxyApiClient.getS3CacheBucketName(layerName);

      await expect(action).resolves.toBe(bucketName);
      // eslint-disable-next-line import-x/no-named-as-default-member
      expect(nock.isDone()).toBe(true);
    });

    it('should return undefined when the cache has no bucket_name (global default bucket)', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.mapproxyApi');
      const layerName: LayerName = 'test-Orthophoto';

      nock(baseUrl)
        .get(`/layer/${layerName}/${LayerCacheType.S3}`)
        .reply(200, { cacheName: 'cacheName', cache: { type: LayerCacheType.S3 } });

      const action = mapproxyApiClient.getS3CacheBucketName(layerName);

      await expect(action).resolves.toBeUndefined();
    });

    it('should return undefined when the layer s3 cache is not found (layer already removed)', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.mapproxyApi');
      const layerName: LayerName = 'not_found-Orthophoto';

      nock(baseUrl).get(`/layer/${layerName}/${LayerCacheType.S3}`).reply(404);

      const action = mapproxyApiClient.getS3CacheBucketName(layerName);

      await expect(action).resolves.toBeUndefined();
    });

    it('should rethrow on a server error', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.mapproxyApi');
      const layerName: LayerName = 'error-Orthophoto';

      nock(baseUrl).get(`/layer/${layerName}/${LayerCacheType.S3}`).reply(500);

      const action = mapproxyApiClient.getS3CacheBucketName(layerName);

      await expect(action).rejects.toThrow();
    });
  });

  describe('removeLayer', () => {
    it('should remove a layer from mapproxy', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.mapproxyApi');
      const layerName = 'test_orthophoto';

      nock(baseUrl).delete('/layer').query({ 'layerNames[]': layerName }).reply(200, []);

      const action = mapproxyApiClient.removeLayer(layerName);

      await expect(action).resolves.not.toThrow();
      // eslint-disable-next-line import-x/no-named-as-default-member
      expect(nock.isDone()).toBe(true);
    });

    it('should treat a 404 as success (idempotent re-run)', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.mapproxyApi');
      const layerName = 'already_removed_orthophoto';

      nock(baseUrl).delete('/layer').query({ 'layerNames[]': layerName }).reply(404);

      const action = mapproxyApiClient.removeLayer(layerName);

      await expect(action).resolves.not.toThrow();
    });

    it('should throw DeleteLayerError when mapproxy reports the layer as failed', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.mapproxyApi');
      const layerName = 'failed_orthophoto';

      nock(baseUrl).delete('/layer').query({ 'layerNames[]': layerName }).reply(200, [layerName]);

      const action = mapproxyApiClient.removeLayer(layerName);

      await expect(action).rejects.toThrow(DeleteLayerError);
    });

    it('should throw DeleteLayerError on a server error', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.mapproxyApi');
      const layerName = 'error_orthophoto';

      nock(baseUrl).delete('/layer').query({ 'layerNames[]': layerName }).reply(500);

      const action = mapproxyApiClient.removeLayer(layerName);

      await expect(action).rejects.toThrow(DeleteLayerError);
    });
  });
});
