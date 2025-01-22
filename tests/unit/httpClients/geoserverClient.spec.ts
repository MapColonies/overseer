import nock from 'nock';
import jsLogger from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { GeoserverClient } from '../../../src/httpClients/geoserverClient';
import { configMock, registerDefaultConfig } from '../mocks/configMock';
import { PublishLayerError } from '../../../src/common/errors';
import { LayerNameFormats } from '../../../src/common/interfaces';

describe('GeoserverClient', () => {
  let geoServerClient: GeoserverClient;
  beforeEach(() => {
    registerDefaultConfig();
    const tracerMock = trace.getTracer('test');
    geoServerClient = new GeoserverClient(configMock, jsLogger({ enabled: false }), tracerMock);
  });

  afterEach(() => {
    nock.cleanAll();
    jest.resetAllMocks();
  });
  describe('publish', () => {
    it('should publish a layer to geoserver', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.geoserverApi');
      const workspace = configMock.get<string>('geoserver.workspace');
      const dataStore = configMock.get<string>('geoserver.dataStore');
      const layersName: LayerNameFormats = {
        layerName: 'test-layer',
        nativeName: 'test_layer',
      };

      nock(baseUrl).post(`/featureTypes/${workspace}/${dataStore}`).reply(201);

      const action = geoServerClient.publish(layersName);

      await expect(action).resolves.not.toThrow();
      expect(nock.isDone()).toBe(true);
    });
  });

  it('should throw an error when geoserver client returns an error', async () => {
    const baseUrl = configMock.get<string>('servicesUrl.geoserverApi');
    const workspace = configMock.get<string>('geoserver.workspace');
    const dataStore = configMock.get<string>('geoserver.dataStore');
    const layersName: LayerNameFormats = {
      layerName: 'error-Test-Layer',
      nativeName: 'error_test_layer',
    };

    nock(baseUrl).post(`/featureTypes/${workspace}/${dataStore}`).reply(500);

    const action = geoServerClient.publish(layersName);

    await expect(action).rejects.toThrow(PublishLayerError);
  });
});
