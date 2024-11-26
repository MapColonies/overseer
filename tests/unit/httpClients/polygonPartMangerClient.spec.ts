import jsLogger from '@map-colonies/js-logger';
import { faker } from '@faker-js/faker';
import nock from 'nock';
import { PolygonPartsMangerClient } from '../../../src/httpClients/polygonPartsMangerClient';
import { configMock, registerDefaultConfig } from '../mocks/configMock';
import { createFakeAggregatedPartData } from './catalogCLientSetup';

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
    it('should return aggregated part data', async () => {
      polygonPartsManagerClient = new PolygonPartsMangerClient(configMock, jsLogger({ enabled: false }));

      const baseUrl = configMock.get<string>('servicesUrl.polygonPartsManager');
      const catalogId = faker.string.uuid();
      const aggregatedPartData = createFakeAggregatedPartData();
      nock(baseUrl).get(`/aggregation/${catalogId}`).reply(200, aggregatedPartData);

      const action = polygonPartsManagerClient.getAggregatedLayerMetadata(catalogId);
      const result = {
        ...aggregatedPartData,
        imagingTimeBeginUTC: aggregatedPartData.imagingTimeBeginUTC.toISOString(),
        imagingTimeEndUTC: aggregatedPartData.imagingTimeEndUTC.toISOString(),
      };
      await expect(action).resolves.toEqual(result);
      expect(nock.isDone()).toBe(true);
    });
  });
});
