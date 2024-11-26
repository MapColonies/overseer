import nock from 'nock';
import { clear as clearConfig, configMock, registerDefaultConfig } from '../mocks/configMock';
import { PublishLayerError, UpdateLayerError } from '../../../src/common/errors';
import { ingestionNewJobExtended, ingestionUpdateJob } from '../mocks/jobsMockData';
import { createFakeAggregatedPartData, setupCatalogClientTest } from './catalogCLientSetup';

describe('CatalogClient', () => {
  beforeEach(() => {
    registerDefaultConfig();
  });

  afterEach(() => {
    nock.cleanAll();
    clearConfig();
    jest.resetAllMocks();
  });
  describe('publish', () => {
    it('should publish a layer to catalog', async () => {
      const { catalogClient, createLinksMock, polygonPartsManagerClientMock } = setupCatalogClientTest();

      createLinksMock.mockReturnValue([]);
      const baseUrl = configMock.get<string>('servicesUrl.catalogManager');
      const layerName = 'testLayer';

      polygonPartsManagerClientMock.getAggregatedLayerMetadata.mockResolvedValue(createFakeAggregatedPartData());

      nock(baseUrl).post('/records').reply(201);

      const action = catalogClient.publish(ingestionNewJobExtended, layerName);

      await expect(action).resolves.not.toThrow();
      expect(nock.isDone()).toBe(true);
    });

    it('should throw an PublishLayerError when the catalog returns an error', async () => {
      const { catalogClient, createLinksMock } = setupCatalogClientTest();

      createLinksMock.mockReturnValue([]);
      const baseUrl = configMock.get<string>('servicesUrl.catalogManager');
      const layerName = 'testLayer';

      nock(baseUrl).post('/records').reply(500);

      const action = catalogClient.publish(ingestionNewJobExtended, layerName);

      await expect(action).rejects.toThrow(PublishLayerError);
    });
  });
  describe('update', () => {
    it('should update a layer in catalog', async () => {
      const { catalogClient } = setupCatalogClientTest();
      const baseUrl = configMock.get<string>('servicesUrl.catalogManager');
      const recordId = ingestionUpdateJob.internalId;
      nock(baseUrl).put(`/records/${recordId}`).reply(200);

      const action = catalogClient.update(ingestionUpdateJob);

      await expect(action).resolves.not.toThrow();
      expect(nock.isDone()).toBe(true);
    });

    it('should throw an PublishLayerError when the catalog returns an error', async () => {
      const { catalogClient } = setupCatalogClientTest();
      const baseUrl = configMock.get<string>('servicesUrl.catalogManager');
      const recordId = ingestionUpdateJob.internalId;
      nock(baseUrl).put(`/records/${recordId}`).reply(500);

      const action = catalogClient.update(ingestionUpdateJob);

      await expect(action).rejects.toThrow(UpdateLayerError);
    });
  });
});
