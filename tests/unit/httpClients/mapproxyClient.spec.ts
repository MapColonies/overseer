import nock from 'nock';
import jsLogger from '@map-colonies/js-logger';
import { trace, Tracer } from '@opentelemetry/api';
import { TileOutputFormat } from '@map-colonies/mc-model-types';
import { MapproxyApiClient } from '../../../src/httpClients/mapproxyClient';
import { configMock, init as InitConfig, setValue } from '../mocks/configMock';
import {
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

  beforeEach(() => {
    tracerMock = trace.getTracer('test');
    InitConfig();
  });

  afterEach(() => {
    nock.cleanAll();
    jest.resetAllMocks();
  });

  describe('publish', () => {
    it('should publish a layer to mapproxy', async () => {
      setValue('tilesStorageProvider', 'FS');

      mapproxyApiClient = new MapproxyApiClient(configMock, jsLogger({ enabled: false }), tracerMock);
      const baseUrl = configMock.get<string>('servicesUrl.mapproxyApi');
      const layerName = 'testLayer';
      const layerRelativePath = 'testLayerPath';
      const tileOutputFormat = TileOutputFormat.PNG;

      nock(baseUrl).post('/layer').reply(201);

      const action = mapproxyApiClient.publish(layerName, layerRelativePath, tileOutputFormat);

      await expect(action).resolves.not.toThrow();
      expect(nock.isDone()).toBe(true);
    });

    it('should throw an error for unsupported storage provider', () => {
      setValue('tilesStorageProvider', 'unsupported');

      try {
        mapproxyApiClient = new MapproxyApiClient(configMock, jsLogger({ enabled: false }), tracerMock);
      } catch (err) {
        // eslint-disable-next-line jest/no-conditional-expect
        expect(err).toBeInstanceOf(UnsupportedStorageProviderError);
      }
    });

    it('should throw an PublishLayerError when mapproxyApi client returns an error', async () => {
      setValue('tilesStorageProvider', 'FS');

      mapproxyApiClient = new MapproxyApiClient(configMock, jsLogger({ enabled: false }), tracerMock);
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
      setValue('tilesStorageProvider', 'FS');

      mapproxyApiClient = new MapproxyApiClient(configMock, jsLogger({ enabled: false }), tracerMock);
      const baseUrl = configMock.get<string>('servicesUrl.mapproxyApi');
      const layerName = 'test-layer';
      const layerRelativePath = 'bfa79f98-79af-44b2-8acd-6dc1ebb9fd1c/c3959032-c6df-41ba-945a-80633510123a';
      const tileOutputFormat = TileOutputFormat.PNG;

      nock(baseUrl).put(`/layer/${layerName}`).reply(200);

      const action = mapproxyApiClient.update(layerName, layerRelativePath, tileOutputFormat);

      await expect(action).resolves.not.toThrow();
      expect(nock.isDone()).toBe(true);
    });

    it('should throw an error for unsupported storage provider', () => {
      setValue('tilesStorageProvider', 'unsupported');
      try {
        mapproxyApiClient = new MapproxyApiClient(configMock, jsLogger({ enabled: false }), tracerMock);
      } catch (err) {
        // eslint-disable-next-line jest/no-conditional-expect
        expect(err).toBeInstanceOf(UnsupportedStorageProviderError);
      }
    });

    it('should throw an PublishLayerError when mapproxyApi client returns an error', async () => {
      setValue('tilesStorageProvider', 'FS');

      mapproxyApiClient = new MapproxyApiClient(configMock, jsLogger({ enabled: false }), tracerMock);
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
      mapproxyApiClient = new MapproxyApiClient(configMock, jsLogger({ enabled: false }), tracerMock);
      const baseUrl = configMock.get<string>('servicesUrl.mapproxyApi');
      const layerName = 'test-layer';
      const cacheType = LayerCacheType.REDIS;
      const cacheName = 'cacheName';

      nock(baseUrl)
        .get(`/layer/${layerName}/${cacheType}`)
        .reply(200, { cacheName, cache: { type: cacheType } });

      const action = mapproxyApiClient.getCacheName({ layerName, cacheType });

      await expect(action).resolves.not.toThrow();
      expect(nock.isDone()).toBe(true);
      expect(await action).toBe(cacheName);
    });

    it('should throw an error for unsupported layer cache type', async () => {
      mapproxyApiClient = new MapproxyApiClient(configMock, jsLogger({ enabled: false }), tracerMock);
      const baseUrl = configMock.get<string>('servicesUrl.mapproxyApi');
      const layerName = 'test-layer';
      const cacheType = LayerCacheType.FS;
      const cacheName = 'cacheName';

      nock(baseUrl)
        .get(`/layer/${layerName}/${cacheType}`)
        .reply(200, { cacheName, cache: { type: cacheType } });

      const action = mapproxyApiClient.getCacheName({ layerName, cacheType });

      await expect(action).rejects.toThrow(UnsupportedLayerCacheError);
    });

    it('should throw an LayerCacheNotFoundError when mapproxyApi client returns an error', async () => {
      setValue('tilesStorageProvider', 'FS');

      mapproxyApiClient = new MapproxyApiClient(configMock, jsLogger({ enabled: false }), tracerMock);
      const baseUrl = configMock.get<string>('servicesUrl.mapproxyApi');
      const layerName = 'not-found-layer';
      const cacheType = LayerCacheType.REDIS;

      nock(baseUrl).get(`/layer/${layerName}/${cacheType}`).reply(404);

      const action = mapproxyApiClient.getCacheName({ layerName, cacheType });

      await expect(action).rejects.toThrow(LayerCacheNotFoundError);
    });
  });
});
