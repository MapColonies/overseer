import { IngestionNewJobParams, IngestionUpdateJobParams, ProductType, TileOutputFormat, Transparency } from '@map-colonies/mc-model-types';
import { IJobResponse, OperationStatus } from '@map-colonies/mc-priority-queue';
import { IngestionNewExtendedJobParams, Grid } from '../../../src/common/interfaces';
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

export const ingestionNewJobExtended: IJobResponse<IngestionNewExtendedJobParams, unknown> = {
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
    additionalParams: {
      polygonPartsEntityName: 'some_polygon_parts_entity_name_orthophoto',
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
      polygonPartsEntityName: 'some_polygon_parts_entity_name_orthophoto',
      footprint: {
        type: 'Polygon',
        coordinates: [
          [
            [34.49104867432604, 31.594398316428197],
            [34.215929673148224, 31.317949494133188],
            [34.25987647128696, 31.224229844075623],
            [34.379712437865265, 31.289166973102937],
            [34.364514326679796, 31.371318172982612],
            [34.56870209988847, 31.53542710418651],
            [34.49104867432604, 31.594398316428197],
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
