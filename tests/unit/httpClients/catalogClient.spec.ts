/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { randomUUID } from 'node:crypto';
import type { Mocked } from 'vitest';
import nock from 'nock';
import { clear as clearConfig, configMock, registerDefaultConfig } from '../mocks/configMock';
import { type IngestionSwapUpdateFinalizeJob } from '../../../src/utils/zod/schemas/job.schema';
import { LayerNotFoundError, PublishLayerError, UpdateLayerError } from '../../../src/common/errors';
import { exportJob, ingestionNewJobExtended, ingestionSwapUpdateJob, ingestionUpdateFinalizeJob, ingestionUpdateJob } from '../mocks/jobsMockData';
import type { FindLayerResponse } from '../../../src/common/interfaces';
import { layerRecord } from '../mocks/catalogClientMockData';
import type { CatalogClient } from '../../../src/httpClients/catalogClient';
import type { PolygonPartsMangerClient } from '../../../src/httpClients/polygonPartsMangerClient';
import { createFakeAggregatedPartData, layerNameFormats, setupCatalogClientTest, type MockCreateLinks } from './catalogClientSetup';

describe('CatalogClient', () => {
  let catalogClient: CatalogClient;
  let createLinksMock: MockCreateLinks;
  let polygonPartsManagerClientMock: Mocked<PolygonPartsMangerClient>;

  beforeEach(async () => {
    registerDefaultConfig();
    ({ catalogClient, createLinksMock, polygonPartsManagerClientMock } = await setupCatalogClientTest());
  });

  afterEach(() => {
    // eslint-disable-next-line import-x/no-named-as-default-member
    nock.cleanAll();
    clearConfig();
    vi.resetAllMocks();
  });

  describe('publish', () => {
    it('should publish a layer to catalog', async () => {
      createLinksMock.mockReturnValue([]);
      const baseUrl = configMock.get<string>('servicesUrl.catalogManager');

      polygonPartsManagerClientMock.getAggregatedLayerMetadata.mockResolvedValue(createFakeAggregatedPartData());

      nock(baseUrl).post('/records').reply(201);

      const action = catalogClient.publish(ingestionNewJobExtended, layerNameFormats);

      await expect(action).resolves.not.toThrow();
      // eslint-disable-next-line import-x/no-named-as-default-member
      expect(nock.isDone()).toBe(true);
    });

    it('should include keywords in the publish request body when job has keywords', async () => {
      createLinksMock.mockReturnValue([]);
      const baseUrl = configMock.get<string>('servicesUrl.catalogManager');
      const jobWithKeywords: typeof ingestionNewJobExtended = {
        ...ingestionNewJobExtended,
        parameters: {
          ...ingestionNewJobExtended.parameters,
          metadata: { ...ingestionNewJobExtended.parameters.metadata, keywords: 'satellite,aerial' },
        },
      };
      polygonPartsManagerClientMock.getAggregatedLayerMetadata.mockResolvedValue(createFakeAggregatedPartData());

      let requestBody: unknown;
      nock(baseUrl)
        .post('/records')
        .reply(201, (_, reqBody) => {
          requestBody = reqBody;
        });

      await catalogClient.publish(jobWithKeywords, layerNameFormats);

      expect(requestBody).toMatchObject({ metadata: { keywords: 'satellite,aerial' } });
    });

    it('should not include keywords in the publish request body when job has no keywords', async () => {
      createLinksMock.mockReturnValue([]);
      const baseUrl = configMock.get<string>('servicesUrl.catalogManager');
      polygonPartsManagerClientMock.getAggregatedLayerMetadata.mockResolvedValue(createFakeAggregatedPartData());

      let requestBody: Record<string, unknown> | undefined;
      nock(baseUrl)
        .post('/records')
        .reply(201, (_, reqBody) => {
          requestBody = reqBody as Record<string, unknown>;
        });

      await catalogClient.publish(ingestionNewJobExtended, layerNameFormats);

      expect((requestBody?.['metadata'] as Record<string, unknown>)?.['keywords']).toBeUndefined();
    });

    it('should throw an PublishLayerError when the catalog returns an error', async () => {
      createLinksMock.mockReturnValue([]);
      const baseUrl = configMock.get<string>('servicesUrl.catalogManager');

      nock(baseUrl).post('/records').reply(500);

      const action = catalogClient.publish(ingestionNewJobExtended, layerNameFormats);

      await expect(action).rejects.toThrow(PublishLayerError);
    });
  });

  describe('update', () => {
    it('should update a layer in catalog', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.catalogManager');
      const recordId = ingestionUpdateJob.internalId;
      let requestBody;
      nock(baseUrl)
        .put(`/records/${recordId}`)
        .reply(200, (_, reqBody) => {
          requestBody = reqBody;
        });

      const action = catalogClient.update(ingestionUpdateFinalizeJob, layerNameFormats.polygonPartsEntityName);

      await expect(action).resolves.not.toThrow();
      expect(requestBody).toMatchObject({
        metadata: {
          productVersion: expect.any(String),
          classification: expect.any(String),
          displayPath: expect.any(String),
          ingestionDate: expect.any(String),
        },
      });
      // eslint-disable-next-line import-x/no-named-as-default-member
      expect(nock.isDone()).toBe(true);
    });

    it('should swap update a layer in catalog', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.catalogManager');
      const swapUpdateJob: IngestionSwapUpdateFinalizeJob = {
        ...ingestionSwapUpdateJob,
        parameters: {
          ...ingestionSwapUpdateJob.parameters,
          additionalParams: {
            ...ingestionSwapUpdateJob.parameters.additionalParams,
            displayPath: 'd1e9fe74-2a8f-425f-ac46-d65bb5c5756d',
          },
        },
      };
      const recordId = swapUpdateJob.internalId;
      let requestBody;
      nock(baseUrl)
        .put(`/records/${recordId}`)
        .reply(200, (_, reqBody) => {
          requestBody = reqBody;
          return swapUpdateJob;
        });

      const action = catalogClient.update(swapUpdateJob, layerNameFormats.polygonPartsEntityName);

      await expect(action).resolves.not.toThrow();
      expect(requestBody).toMatchObject({
        metadata: {
          productVersion: expect.any(String),
          classification: expect.any(String),
          displayPath: expect.any(String),
          ingestionDate: expect.any(String),
        },
      });
      // eslint-disable-next-line import-x/no-named-as-default-member
      expect(nock.isDone()).toBe(true);
    });

    it('should throw an UpdateLayerError when the catalog returns an error', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.catalogManager');
      const recordId = ingestionUpdateJob.internalId;
      nock(baseUrl).put(`/records/${recordId}`).reply(500);

      const action = catalogClient.update(ingestionUpdateFinalizeJob, layerNameFormats.polygonPartsEntityName);

      await expect(action).rejects.toThrow(UpdateLayerError);
    });

    it('should throw an UpdateLayerError when getting aggregation layer metadata failed', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.polygonPartsManager');
      const polygonPartsEntityName = 'some_polygon_parts_entity_name_orthophoto';
      nock(baseUrl).get(`/aggregation/${polygonPartsEntityName}`).reply(500);
      polygonPartsManagerClientMock.getAggregatedLayerMetadata.mockRejectedValue(new Error('Failed to get aggregation layer metadata'));

      const action = catalogClient.update(ingestionUpdateFinalizeJob, layerNameFormats.polygonPartsEntityName);

      await expect(action).rejects.toThrow(UpdateLayerError);
    });
  });

  describe('findLayer', () => {
    it('should return layer', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.catalogManager');
      const recordId = exportJob.internalId as string;
      const reqBody = { id: recordId };
      const layer: FindLayerResponse = layerRecord;
      nock(baseUrl)
        .post(`/records/find`, reqBody)
        .reply(200, () => [layer]);

      const layerResponse = await catalogClient.findLayer(recordId);

      //use stringify to compare objects to handle the dates comparison
      expect(JSON.stringify(layerResponse)).toBe(JSON.stringify(layer));
    });

    it('should throw LayerNotFoundError when layer not found', async () => {
      const baseUrl = configMock.get<string>('servicesUrl.catalogManager');
      const nonExistingRecordId = randomUUID();
      const reqBody = { id: nonExistingRecordId };
      nock(baseUrl)
        .post(`/records/find`, reqBody)
        .reply(200, () => []);

      const action = catalogClient.findLayer(nonExistingRecordId);

      await expect(action).rejects.toThrow(LayerNotFoundError);
    });
  });
});
