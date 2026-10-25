import nock from 'nock';
import { buildPolygonPartsFeatureTypeBody, type LayerNameFormats } from '@map-colonies/raster-shared';
import { getTestLogger } from '../../configurations/testLogger';
import { GeoserverClient } from '../../../src/httpClients/geoserverClient';
import { configMock, registerDefaultConfig } from '../mocks/configMock';
import { DeleteLayerError, PublishLayerError } from '../../../src/common/errors';
import type { GeoserverConfig } from '../../../src/common/interfaces';
import { tracerMock } from '../mocks/tracerMock';

describe('GeoserverClient', () => {
  let geoServerClient: GeoserverClient;
  let geoserverScope: nock.Scope;
  let geoserverOrigin: string;
  let featureTypesPath: string;

  const layersName: LayerNameFormats = {
    layerName: 'test-Orthophoto',
    polygonPartsEntityName: 'test_orthophoto',
  };

  beforeEach(async () => {
    registerDefaultConfig();
    geoServerClient = new GeoserverClient(configMock, await getTestLogger(), tracerMock);

    const { workspace, dataStore, auth } = configMock.get<GeoserverConfig>('geoserver');
    const geoserverUrl = new URL(configMock.get<string>('servicesUrl.geoserver'));
    geoserverOrigin = geoserverUrl.origin;
    featureTypesPath = `${geoserverUrl.pathname}/rest/workspaces/${workspace}/datastores/${dataStore}/featuretypes`;
    geoserverScope = nock(geoserverOrigin).matchHeader(
      'authorization',
      `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`
    );
  });

  afterEach(() => {
    // eslint-disable-next-line import-x/no-named-as-default-member
    nock.cleanAll();
    vi.resetAllMocks();
  });

  describe('publish', () => {
    it('should publish a layer to geoserver when its table exists and the layer name is free', async () => {
      const expectedBody = buildPolygonPartsFeatureTypeBody({ nativeName: layersName.polygonPartsEntityName, name: layersName.layerName });
      geoserverScope
        .get(featureTypesPath)
        .query({ list: 'all' })
        .reply(200, { list: { string: ['other_orthophoto', layersName.polygonPartsEntityName] } })
        .get(featureTypesPath)
        .query({ list: 'configured' })
        .reply(200, { featureTypes: { featureType: { name: 'other-Orthophoto', href: 'http://geoserver/other' } } })
        .post(featureTypesPath, (body) => JSON.stringify(body) === JSON.stringify(expectedBody))
        .reply(201);

      const action = geoServerClient.publish(layersName);

      await expect(action).resolves.not.toThrow();
      expect(geoserverScope.isDone()).toBe(true);
    });

    it('should publish a layer to geoserver when no layer is configured yet', async () => {
      geoserverScope
        .get(featureTypesPath)
        .query({ list: 'all' })
        .reply(200, { list: { string: layersName.polygonPartsEntityName } })
        .get(featureTypesPath)
        .query({ list: 'configured' })
        .reply(200, { featureTypes: '' })
        .post(featureTypesPath)
        .reply(201);

      const action = geoServerClient.publish(layersName);

      await expect(action).resolves.not.toThrow();
      expect(geoserverScope.isDone()).toBe(true);
    });

    it('should throw PublishLayerError without publishing when the polygon parts table does not exist', async () => {
      geoserverScope
        .get(featureTypesPath)
        .query({ list: 'all' })
        .reply(200, { list: { string: ['other_orthophoto'] } });
      const postScope = nock(geoserverOrigin).post(featureTypesPath).reply(201);

      const action = geoServerClient.publish(layersName);

      await expect(action).rejects.toThrow(PublishLayerError);
      await expect(action).rejects.toThrow(/does not exist/);
      expect(postScope.isDone()).toBe(false);
    });

    it('should throw PublishLayerError without publishing when the layer name is already configured', async () => {
      geoserverScope
        .get(featureTypesPath)
        .query({ list: 'all' })
        .reply(200, { list: { string: [layersName.polygonPartsEntityName] } })
        .get(featureTypesPath)
        .query({ list: 'configured' })
        .reply(200, { featureTypes: { featureType: [{ name: layersName.layerName, href: 'http://geoserver/test' }] } });
      const postScope = nock(geoserverOrigin).post(featureTypesPath).reply(201);

      const action = geoServerClient.publish(layersName);

      await expect(action).rejects.toThrow(PublishLayerError);
      await expect(action).rejects.toThrow(/already configured/);
      expect(postScope.isDone()).toBe(false);
    });

    it('should throw PublishLayerError when geoserver returns an error', async () => {
      geoserverScope
        .get(featureTypesPath)
        .query({ list: 'all' })
        .reply(200, { list: { string: [layersName.polygonPartsEntityName] } })
        .get(featureTypesPath)
        .query({ list: 'configured' })
        .reply(200, { featureTypes: '' })
        .post(featureTypesPath)
        .reply(500);

      const action = geoServerClient.publish(layersName);

      await expect(action).rejects.toThrow(PublishLayerError);
    });
  });

  describe('unpublishLayer', () => {
    it('should unpublish a layer feature type from geoserver', async () => {
      const layerName = 'test-Orthophoto';

      geoserverScope.delete(`${featureTypesPath}/${layerName}`).query({ recurse: true }).reply(200);

      const action = geoServerClient.unpublishLayer(layerName);

      await expect(action).resolves.not.toThrow();
      expect(geoserverScope.isDone()).toBe(true);
    });

    it('should treat a 404 as success (idempotent re-run)', async () => {
      const layerName = 'already-gone-Orthophoto';

      geoserverScope.delete(`${featureTypesPath}/${layerName}`).query({ recurse: true }).reply(404);

      const action = geoServerClient.unpublishLayer(layerName);

      await expect(action).resolves.not.toThrow();
    });

    it('should throw DeleteLayerError on a server error', async () => {
      const layerName = 'error_test-Orthophoto';

      geoserverScope.delete(`${featureTypesPath}/${layerName}`).query({ recurse: true }).reply(500);

      const action = geoServerClient.unpublishLayer(layerName);

      await expect(action).rejects.toThrow(DeleteLayerError);
    });
  });
});
