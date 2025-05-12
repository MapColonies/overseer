import jsLogger from '@map-colonies/js-logger';
import { faker } from '@faker-js/faker';
import nock from 'nock';
import { ArtifactRasterType } from '@map-colonies/types';
import { OperationStatus } from '@map-colonies/mc-priority-queue';
import { CallbackExportResponse, RoiFeatureCollection } from '@map-colonies/raster-shared';
import { configMock, registerDefaultConfig } from '../mocks/configMock';
import { CallbackClient } from '../../../src/httpClients/callbackClient';
import { createFakeRoiFeatureCollection } from '../mocks/exportMockData';
import { tracerMock } from '../mocks/tracerMock';

describe('callbackClient', () => {
  let callbackClient: CallbackClient;
  const basePath = 'https://callback.example.com';
  const uri = '/api/callback';
  const roi: RoiFeatureCollection = createFakeRoiFeatureCollection();

  beforeEach(() => {
    registerDefaultConfig();
    callbackClient = new CallbackClient(configMock, jsLogger({ enabled: false }), tracerMock);
  });

  afterEach(() => {
    nock.cleanAll();
    jest.resetAllMocks();
  });

  describe('send', () => {
    it('should successfully send callback data to the specified URL', async () => {
      // Setup
      const callbackUrl = `${basePath}${uri}`;
      const jobId = faker.string.uuid();
      const recordCatalogId = faker.string.uuid();
      const expirationTime = new Date();
      const fileSize = 1024;

      const callbackData: CallbackExportResponse = {
        status: OperationStatus.COMPLETED,
        jobId,
        recordCatalogId,
        expirationTime,
        fileSize,
        roi,
        artifacts: [
          {
            name: 'test.gpkg',
            type: ArtifactRasterType.GPKG,
            size: fileSize,
            url: 'https://download.example.com/gpkgs/test.gpkg',
          },
        ],
        links: {
          dataURI: 'https://download.example.com/gpkgs/test.gpkg',
          metadataURI: 'https://download.example.com/gpkgs/test_metadata.json',
        },
      };

      const scope = nock(basePath).post(uri, JSON.stringify(callbackData)).reply(200);

      await callbackClient.send(callbackUrl, callbackData);

      expect(scope.isDone()).toBe(true);
    });

    it('should successfully send failure callback data', async () => {
      const callbackUrl = `${basePath}${uri}`;
      const jobId = faker.string.uuid();
      const recordCatalogId = faker.string.uuid();

      const callbackData: CallbackExportResponse = {
        status: OperationStatus.FAILED,
        jobId,
        recordCatalogId,
        errorReason: 'Export process failed',
        roi,
      };

      const scope = nock(basePath).post(uri, JSON.stringify(callbackData)).reply(200);

      await callbackClient.send(callbackUrl, callbackData);

      expect(scope.isDone()).toBe(true);
    });

    it('should throw an error when the callback request fails', async () => {
      const callbackUrl = `${basePath}${uri}`;
      const jobId = faker.string.uuid();
      const recordCatalogId = faker.string.uuid();

      const callbackData: CallbackExportResponse = {
        status: OperationStatus.IN_PROGRESS,
        jobId,
        recordCatalogId,
        roi,
      };

      // Mock a failed HTTP request
      nock(basePath).post(uri).reply(500, { error: 'Internal server error' });

      await expect(callbackClient.send(callbackUrl, callbackData)).rejects.toThrow();
    });

    it('should handle connection errors gracefully', async () => {
      const callbackUrl = `https://non-existent-domain.com/${uri}`;
      const jobId = faker.string.uuid();
      const recordCatalogId = faker.string.uuid();

      const callbackData: CallbackExportResponse = {
        status: OperationStatus.COMPLETED,
        jobId,
        recordCatalogId,
        roi,
      };

      // Mock a network error
      nock(callbackUrl).post('/').replyWithError('Connection refused');

      await expect(callbackClient.send(callbackUrl, callbackData)).rejects.toThrow();
    });
  });
});
