import jsLogger from '@map-colonies/js-logger';
import { faker } from '@faker-js/faker';
import { AggregationFeature, RoiFeatureCollection } from '@map-colonies/raster-shared';
import nock from 'nock';
import { PolygonPartsMangerClient } from '../../../src/httpClients/polygonPartsMangerClient';
import { createFakeRoiFeatureCollection } from '../mocks/exportMockData';
import { LayerMetadataAggregationError } from '../../../src/common/errors';
import { configMock, registerDefaultConfig } from '../mocks/configMock';
import { createFakeAggregatedFeature } from './catalogClientSetup';

describe('polygonPartsManagerClient', () => {
  let polygonPartsManagerClient: PolygonPartsMangerClient;
  beforeEach(() => {
    registerDefaultConfig();
  });
  afterEach(() => {
    nock.cleanAll();
    jest.resetAllMocks();
  });

  describe('getAggregatedLayerMetadata', () => {
    it('should return aggregated part data based on polygonPartsEntityName', async () => {
      polygonPartsManagerClient = new PolygonPartsMangerClient(configMock, jsLogger({ enabled: false }));

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
      expect(nock.isDone()).toBe(true);
    });

    it('should return aggregated part data based on polygonPartsEntityName and filter', async () => {
      polygonPartsManagerClient = new PolygonPartsMangerClient(configMock, jsLogger({ enabled: false }));
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
      expect(nock.isDone()).toBe(true);
    });

    it('should throw an LayerMetadataAggregationError when the request fails', async () => {
      polygonPartsManagerClient = new PolygonPartsMangerClient(configMock, jsLogger({ enabled: false }));

      const baseUrl = configMock.get<string>('servicesUrl.polygonPartsManager');
      const polygonPartsEntityName = faker.string.uuid();
      const url = `/polygonParts/${polygonPartsEntityName}/aggregate`;
      nock(baseUrl).post(url, { filter: null }).reply(500);

      const action = polygonPartsManagerClient.getAggregatedLayerMetadata(polygonPartsEntityName);

      await expect(action).rejects.toThrow(LayerMetadataAggregationError);
      expect(nock.isDone()).toBe(true);
    });

    it('should throw an LayerMetadataAggregationError when the entity does not exist', async () => {
      polygonPartsManagerClient = new PolygonPartsMangerClient(configMock, jsLogger({ enabled: false }));

      const baseUrl = configMock.get<string>('servicesUrl.polygonPartsManager');
      const polygonPartsEntityName = faker.string.uuid();
      const url = `/polygonParts/${polygonPartsEntityName}/aggregate`;
      nock(baseUrl).post(url, { filter: null }).reply(404);

      const action = polygonPartsManagerClient.getAggregatedLayerMetadata(polygonPartsEntityName);

      await expect(action).rejects.toThrow(LayerMetadataAggregationError);
      expect(nock.isDone()).toBe(true);
    });

    it('Should throw a LayerMetadataAggregationError error when the response returns invalid due to filtering', async () => {
      polygonPartsManagerClient = new PolygonPartsMangerClient(configMock, jsLogger({ enabled: false }));
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
});
