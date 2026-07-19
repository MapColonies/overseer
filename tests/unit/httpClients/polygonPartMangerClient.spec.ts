import { faker } from '@faker-js/faker';
import { RasterProductTypes, type AggregationFeature, type RoiFeatureCollection } from '@map-colonies/raster-shared';
import nock from 'nock';
import { getTestLogger } from '../../configurations/testLogger';
import { PolygonPartsMangerClient } from '../../../src/httpClients/polygonPartsMangerClient';
import { createFakeRoiFeatureCollection } from '../mocks/exportMockData';
import { DeleteLayerError, LayerMetadataAggregationError, PolygonPartsProcessingError } from '../../../src/common/errors';
import type { PolygonPartsProcessPayload } from '../../../src/common/interfaces';
import { configMock, registerDefaultConfig } from '../mocks/configMock';
import { createFakeAggregatedFeature } from './catalogClientSetup';

describe('polygonPartsManagerClient', () => {
  let polygonPartsManagerClient: PolygonPartsMangerClient;

  beforeEach(async () => {
    registerDefaultConfig();
    polygonPartsManagerClient = new PolygonPartsMangerClient(configMock, await getTestLogger());
  });

  afterEach(() => {
    // eslint-disable-next-line import-x/no-named-as-default-member
    nock.cleanAll();
    vi.resetAllMocks();
  });

  describe('process', () => {
    it('should process polygon parts successfully', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.polygonPartsManager');
      const payload: PolygonPartsProcessPayload = {
        productId: 'test_layer',
        productType: RasterProductTypes.ORTHOPHOTO,
      };
      const url = '/polygonParts/process';
      nock(baseUrl).put(url, payload).reply(200);

      const action = polygonPartsManagerClient.process(payload);

      await expect(action).resolves.toBeUndefined();
      // eslint-disable-next-line import-x/no-named-as-default-member
      expect(nock.isDone()).toBe(true);
    });

    it('should process polygon parts and replacing old data successfully', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.polygonPartsManager');
      const payload: PolygonPartsProcessPayload = {
        shouldClearEntities: true,
        productId: 'test_layer',
        productType: RasterProductTypes.ORTHOPHOTO,
      };
      const url = '/polygonParts/process';
      nock(baseUrl).put(url, payload).reply(200);

      const action = polygonPartsManagerClient.process(payload);

      await expect(action).resolves.toBeUndefined();
      // eslint-disable-next-line import-x/no-named-as-default-member
      expect(nock.isDone()).toBe(true);
    });

    it('should throw PolygonPartsProcessingError when the request fails', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.polygonPartsManager');
      const payload: PolygonPartsProcessPayload = {
        productId: 'test_layer',
        productType: RasterProductTypes.ORTHOPHOTO,
      };
      const url = '/polygonParts/process';
      nock(baseUrl).put(url, payload).reply(500);

      const action = polygonPartsManagerClient.process(payload);

      await expect(action).rejects.toThrow(PolygonPartsProcessingError);
      // eslint-disable-next-line import-x/no-named-as-default-member
      expect(nock.isDone()).toBe(true);
    });
  });

  describe('getAggregatedLayerMetadata', () => {
    it('should return aggregated part data based on polygonPartsEntityName', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.polygonPartsManager');
      const polygonPartsEntityName = 'bluemarble_orthophoto';
      const aggregatedFeature = createFakeAggregatedFeature();
      const url = `/polygonParts/${polygonPartsEntityName}/aggregate`;
      nock(baseUrl).post(url, { filter: null }).reply(200, aggregatedFeature);

      const action = polygonPartsManagerClient.getAggregatedLayerMetadata(polygonPartsEntityName);
      const expectedResult = {
        footprint: aggregatedFeature.geometry,
        ...aggregatedFeature.properties,
      };

      await expect(action).resolves.toEqual(expectedResult);
      // eslint-disable-next-line import-x/no-named-as-default-member
      expect(nock.isDone()).toBe(true);
    });

    it('should return aggregated part data based on polygonPartsEntityName and filter', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.polygonPartsManager');
      const polygonPartsEntityName = 'bluemarble_orthophoto';
      const featureCollection: RoiFeatureCollection = createFakeRoiFeatureCollection();
      const filter = { filter: featureCollection };
      const aggregatedFeature = createFakeAggregatedFeature();
      const url = `/polygonParts/${polygonPartsEntityName}/aggregate`;
      nock(baseUrl).post(url, JSON.stringify(filter)).reply(200, aggregatedFeature);

      const action = polygonPartsManagerClient.getAggregatedLayerMetadata(polygonPartsEntityName, featureCollection);
      const expectedResult = {
        footprint: aggregatedFeature.geometry,
        ...aggregatedFeature.properties,
      };

      await expect(action).resolves.toEqual(expectedResult);
      // eslint-disable-next-line import-x/no-named-as-default-member
      expect(nock.isDone()).toBe(true);
    });

    it('should throw an LayerMetadataAggregationError when the request fails', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.polygonPartsManager');
      const polygonPartsEntityName = faker.string.uuid();
      const url = `/polygonParts/${polygonPartsEntityName}/aggregate`;
      nock(baseUrl).post(url, { filter: null }).reply(500);

      const action = polygonPartsManagerClient.getAggregatedLayerMetadata(polygonPartsEntityName);

      await expect(action).rejects.toThrow(LayerMetadataAggregationError);
      // eslint-disable-next-line import-x/no-named-as-default-member
      expect(nock.isDone()).toBe(true);
    });

    it('should throw an LayerMetadataAggregationError when the entity does not exist', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.polygonPartsManager');
      const polygonPartsEntityName = faker.string.uuid();
      const url = `/polygonParts/${polygonPartsEntityName}/aggregate`;
      nock(baseUrl).post(url, { filter: null }).reply(404);

      const action = polygonPartsManagerClient.getAggregatedLayerMetadata(polygonPartsEntityName);

      await expect(action).rejects.toThrow(LayerMetadataAggregationError);
      // eslint-disable-next-line import-x/no-named-as-default-member
      expect(nock.isDone()).toBe(true);
    });

    it('should throw a LayerMetadataAggregationError error when the response returns invalid due to filtering', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.polygonPartsManager');
      const polygonPartsEntityName = 'bluemarble_orthophoto';
      const featureCollection: RoiFeatureCollection = createFakeRoiFeatureCollection();
      const filter = { filter: featureCollection };
      const aggregatedFeature: AggregationFeature = {
        type: 'Feature',
        geometry: null,
        properties: null,
      };
      const url = `/polygonParts/${polygonPartsEntityName}/aggregate`;
      nock(baseUrl).post(url, JSON.stringify(filter)).reply(200, aggregatedFeature);
      const action = polygonPartsManagerClient.getAggregatedLayerMetadata(polygonPartsEntityName, featureCollection);

      await expect(action).rejects.toThrow(LayerMetadataAggregationError);
    });
  });

  describe('deleteEntities', () => {
    it('should delete polygon parts entities from polygon parts manager', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.polygonPartsManager');
      const polygonPartsEntityName = 'world_orthophoto';

      nock(baseUrl).delete(`/polygonParts/${polygonPartsEntityName}`).reply(204);

      const action = polygonPartsManagerClient.deleteEntities(polygonPartsEntityName);

      await expect(action).resolves.not.toThrow();
      // eslint-disable-next-line import-x/no-named-as-default-member
      expect(nock.isDone()).toBe(true);
    });

    it('should treat a 404 as success (idempotent re-run)', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.polygonPartsManager');
      const polygonPartsEntityName = 'already_gone_orthophoto';

      nock(baseUrl).delete(`/polygonParts/${polygonPartsEntityName}`).reply(404);

      const action = polygonPartsManagerClient.deleteEntities(polygonPartsEntityName);

      await expect(action).resolves.not.toThrow();
    });

    it('should throw DeleteLayerError on a server error', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.polygonPartsManager');
      const polygonPartsEntityName = 'error_test_orthophoto';

      nock(baseUrl).delete(`/polygonParts/${polygonPartsEntityName}`).reply(500);

      const action = polygonPartsManagerClient.deleteEntities(polygonPartsEntityName);

      await expect(action).rejects.toThrow(DeleteLayerError);
    });
  });
});
