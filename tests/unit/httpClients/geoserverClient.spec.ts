import nock from 'nock';
import type { LayerNameFormats } from '@map-colonies/raster-shared';
import { getTestLogger } from '../../configurations/testLogger';
import { GeoserverClient } from '../../../src/httpClients/geoserverClient';
import { configMock, registerDefaultConfig } from '../mocks/configMock';
import { DeleteLayerError, PublishLayerError } from '../../../src/common/errors';
import { tracerMock } from '../mocks/tracerMock';

describe('GeoserverClient', () => {
  let geoServerClient: GeoserverClient;

  beforeEach(async () => {
    registerDefaultConfig();
    geoServerClient = new GeoserverClient(configMock, await getTestLogger(), tracerMock);
  });

  afterEach(() => {
    // eslint-disable-next-line import-x/no-named-as-default-member
    nock.cleanAll();
    vi.resetAllMocks();
  });

  describe('publish', () => {
    it('should publish a layer to geoserver', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.geoserverApi');
      const workspace = configMock.get<string>('geoserver.workspace');
      const dataStore = configMock.get<string>('geoserver.dataStore');
      const layersName: LayerNameFormats = {
        layerName: 'test-Orthophoto',
        polygonPartsEntityName: 'test_orthophoto',
      };

      nock(baseUrl).post(`/featureTypes/${workspace}/${dataStore}`).reply(201);

      const action = geoServerClient.publish(layersName);

      await expect(action).resolves.not.toThrow();
      // eslint-disable-next-line import-x/no-named-as-default-member
      expect(nock.isDone()).toBe(true);
    });
  });

  it('should throw an error when geoserver client returns an error', async () => {
    const baseUrl = configMock.get<string>('servicesUrl.geoserverApi');
    const workspace = configMock.get<string>('geoserver.workspace');
    const dataStore = configMock.get<string>('geoserver.dataStore');
    const layersName: LayerNameFormats = {
      layerName: 'error_test-Orthophoto',
      polygonPartsEntityName: 'error_test_orthophoto',
    };

    nock(baseUrl).post(`/featureTypes/${workspace}/${dataStore}`).reply(500);

    const action = geoServerClient.publish(layersName);

    await expect(action).rejects.toThrow(PublishLayerError);
  });

  describe('unpublishLayer', () => {
    it('should unpublish a layer feature type from geoserver', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.geoserverApi');
      const workspace = configMock.get<string>('geoserver.workspace');
      const dataStore = configMock.get<string>('geoserver.dataStore');
      const layerName = 'test-Orthophoto';

      nock(baseUrl).delete(`/featureTypes/${workspace}/${dataStore}/${layerName}`).reply(204);

      const action = geoServerClient.unpublishLayer(layerName);

      await expect(action).resolves.not.toThrow();
      // eslint-disable-next-line import-x/no-named-as-default-member
      expect(nock.isDone()).toBe(true);
    });

    it('should treat a 404 as success (idempotent re-run)', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.geoserverApi');
      const workspace = configMock.get<string>('geoserver.workspace');
      const dataStore = configMock.get<string>('geoserver.dataStore');
      const layerName = 'already-gone-Orthophoto';

      nock(baseUrl).delete(`/featureTypes/${workspace}/${dataStore}/${layerName}`).reply(404);

      const action = geoServerClient.unpublishLayer(layerName);

      await expect(action).resolves.not.toThrow();
    });

    it('should throw DeleteLayerError on a server error', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.geoserverApi');
      const workspace = configMock.get<string>('geoserver.workspace');
      const dataStore = configMock.get<string>('geoserver.dataStore');
      const layerName = 'error_test-Orthophoto';

      nock(baseUrl).delete(`/featureTypes/${workspace}/${dataStore}/${layerName}`).reply(500);

      const action = geoServerClient.unpublishLayer(layerName);

      await expect(action).rejects.toThrow(DeleteLayerError);
    });
  });
});
