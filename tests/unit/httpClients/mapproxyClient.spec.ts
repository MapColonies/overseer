import nock from 'nock';
import jsLogger from '@map-colonies/js-logger';
import { TileOutputFormat } from '@map-colonies/mc-model-types';
import { MapproxyApiClient } from '../../../src/httpClients/mapproxyClient';
import { clear as clearConfig, configMock, init, setValue } from '../mocks/configMock';
import { PublishLayerError, UnsupportedStorageProviderError } from '../../../src/common/errors';

describe('mapproxyClient', () => {
  let mapproxyApiClient: MapproxyApiClient;

  afterEach(() => {
    nock.cleanAll();
    clearConfig();
    jest.resetAllMocks();
  });

  describe('publish', () => {
    it('should publish a layer to mapproxy', async () => {
      init();
      setValue('tilesStorageProvider', 'FS');

      mapproxyApiClient = new MapproxyApiClient(configMock, jsLogger({ enabled: false }));
      const baseUrl = configMock.get<string>('servicesUrl.mapproxyApi');
      const layerName = 'testLayer';
      const layerRelativePath = 'testLayerPath';
      const tileOutputFormat = TileOutputFormat.PNG;

      nock(baseUrl).post('/layer').reply(201);

      const action = mapproxyApiClient.publish(layerName, layerRelativePath, tileOutputFormat);

      await expect(action).resolves.not.toThrow();
      expect(nock.isDone()).toBe(true);
    });

    it('should throw an error for unsupported storage provider', async () => {
      init();
      setValue('tilesStorageProvider', 'unsupported');
      mapproxyApiClient = new MapproxyApiClient(configMock, jsLogger({ enabled: false }));

      const baseUrl = configMock.get<string>('servicesUrl.mapproxyApi');
      const layerName = 'testLayer';
      const layerRelativePath = 'testLayerPath';
      const tileOutputFormat = TileOutputFormat.PNG;

      nock(baseUrl).post('/layer').reply(201);

      await expect(mapproxyApiClient.publish(layerName, layerRelativePath, tileOutputFormat)).rejects.toThrow(UnsupportedStorageProviderError);
    });

    it('should throw an PublishLayerError when mapproxyApi client returns an error', async () => {
      init();
      setValue('tilesStorageProvider', 'FS');

      mapproxyApiClient = new MapproxyApiClient(configMock, jsLogger({ enabled: false }));
      const baseUrl = configMock.get<string>('servicesUrl.mapproxyApi');
      const layerName = 'errorTestLayer';
      const layerRelativePath = 'errorTestLayerPath';
      const tileOutputFormat = TileOutputFormat.PNG;

      nock(baseUrl).post('/layer').reply(500);

      const action = mapproxyApiClient.publish(layerName, layerRelativePath, tileOutputFormat);

      await expect(action).rejects.toThrow(PublishLayerError);
    });
  });
});
