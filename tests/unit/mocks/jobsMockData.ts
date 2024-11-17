import { IngestionNewJobParams, IngestionUpdateJobParams, ProductType, TileOutputFormat, Transparency } from '@map-colonies/mc-model-types';
import { IJobResponse, OperationStatus } from '@map-colonies/mc-priority-queue';
import { ExtendedNewRasterLayer, Grid } from '../../../src/common/interfaces';
import { partsData } from './partsMockData';

/* eslint-disable @typescript-eslint/no-magic-numbers */

export const ingestionNewJob: IJobResponse<IngestionNewJobParams, unknown> = {
  id: 'de57d743-3155-4a28-86c8-9c181faabd94',
  resourceId: 'some-product-id',
  version: '1.0',
  type: 'Ingestion_New',
  description: '',
  parameters: {
    metadata: {
      srs: '4326',
      scale: 100000000,
      region: ['string'],
      srsName: 'WGS84GEO',
      productId: 'test-product-id',
      description: 'string',
      productName: 'akProduct',
      productType: ProductType.ORTHOPHOTO,
      producerName: 'string',
      transparency: Transparency.TRANSPARENT,
      classification: '6',
      productSubType: 'string',
    },
    partsData,
    inputFiles: {
      fileNames: ['blueMarble.gpkg'],
      originDirectory: 'tests',
    },
    additionalParams: {
      jobTrackerServiceURL: 'http://job-tracker-service',
    },
  },
  status: OperationStatus.PENDING,
  percentage: 0,
  reason: '',
  domain: 'RASTER',
  isCleaned: false,
  priority: 1000,
  expirationDate: '2024-07-21T10:59:23.510Z' as unknown as Date,
  internalId: '89bc4f63-8608-40bf-b845-3cbd4c0c4e03',
  producerName: 'string',
  productName: 'akProduct',
  productType: ProductType.ORTHOPHOTO,
  additionalIdentifiers: 'some-additional-identifiers',
  taskCount: 1,
  completedTasks: 0,
  failedTasks: 0,
  expiredTasks: 0,
  pendingTasks: 0,
  inProgressTasks: 1,
  abortedTasks: 0,
  created: '2024-07-21T10:59:23.510Z',
  updated: '2024-07-21T10:59:23.510Z',
};

export const ingestionNewJobExtended: IJobResponse<ExtendedNewRasterLayer, unknown> = {
  ...ingestionNewJob,
  parameters: {
    ...ingestionNewJob.parameters,
    metadata: {
      catalogId: 'some-catalog-id',
      displayPath: 'some-display-path',
      layerRelativePath: 'some-layer-relative-path',
      tileOutputFormat: TileOutputFormat.PNG,
      tileMimeType: 'image/png',
      grid: Grid.TWO_ON_ONE,
      ...ingestionNewJob.parameters.metadata,
    },
  },
};

export const ingestionUpdateJob: IJobResponse<IngestionUpdateJobParams, unknown> = {
  id: 'd027b3aa-272b-4dc9-91d7-ba8343af5ed1',
  resourceId: 'another-product-id',
  version: '1.0',
  type: 'Ingestion_Update',
  description: '',
  parameters: {
    metadata: {
      classification: '6',
    },
    partsData,
    inputFiles: {
      fileNames: ['blueMarble.gpkg'],
      originDirectory: 'tests',
    },
    additionalParams: {
      jobTrackerServiceURL: 'http://job-tracker-service',
      displayPath: 'd1e9fe74-2a8f-425f-ac46-d65bb5c5756d',
      tileOutputFormat: TileOutputFormat.PNG,
      footprint: {
        type: 'Polygon',
        coordinates: [
          [
            [34.85086081689403, 31.925115892558324],
            [34.8508654452348, 31.925001973021452],
            [34.85102743714913, 31.92500328244263],
            [34.85102743714913, 31.925118511396533],
            [34.85086081689403, 31.925115892558324],
          ],
        ],
      } as GeoJSON.Polygon,
    },
  },
  status: OperationStatus.PENDING,
  percentage: 0,
  reason: '',
  domain: 'RASTER',
  isCleaned: false,
  priority: 1000,
  expirationDate: '2024-07-21T10:59:23.510Z' as unknown as Date,
  internalId: 'a30e93fd-f1a7-480f-a395-47afc97f99b9',
  producerName: 'string',
  productName: 'akProduct',
  productType: ProductType.ORTHOPHOTO,
  additionalIdentifiers: 'some-additional-identifiers',
  taskCount: 1,
  completedTasks: 0,
  failedTasks: 0,
  expiredTasks: 0,
  pendingTasks: 0,
  inProgressTasks: 1,
  abortedTasks: 0,
  created: '2024-07-21T10:59:23.510Z',
  updated: '2024-07-21T10:59:23.510Z',
};

export const ingestionSwapUpdateJob: IJobResponse<IngestionUpdateJobParams, unknown> = {
  id: 'c023b3ba-272b-4dc9-92d7-ba8343af5ed9',
  resourceId: 'another-product-id',
  version: '1.0',
  type: 'Ingestion_Swap_Update',
  description: '',
  parameters: {
    metadata: {
      classification: '6',
    },
    partsData,
    inputFiles: {
      fileNames: ['blueMarble.gpkg'],
      originDirectory: 'tests',
    },
    additionalParams: {
      jobTrackerServiceURL: 'http://job-tracker-service',
      tileOutputFormat: TileOutputFormat.PNG,
      footprint: {
        type: 'Polygon',
        coordinates: [
          [
            [34.9, 32.9],
            [34.9, 32.8],
            [35.0, 32.8],
            [35.0, 32.9],
            [34.9, 32.9],
          ],
        ],
      } as GeoJSON.Polygon,
    },
  },
  status: OperationStatus.PENDING,
  percentage: 0,
  reason: '',
  domain: 'RASTER',
  isCleaned: false,
  priority: 1000,
  expirationDate: '2024-07-21T10:59:23.510Z' as unknown as Date,
  internalId: 'f3ceebf1-3791-43db-967a-317c22ac1897',
  producerName: 'string',
  productName: 'akProduct',
  productType: ProductType.ORTHOPHOTO,
  additionalIdentifiers: 'some-additional-identifiers',
  taskCount: 1,
  completedTasks: 0,
  failedTasks: 0,
  expiredTasks: 0,
  pendingTasks: 0,
  inProgressTasks: 1,
  abortedTasks: 0,
  created: '2024-07-21T10:59:23.510Z',
  updated: '2024-07-21T10:59:23.510Z',
};
