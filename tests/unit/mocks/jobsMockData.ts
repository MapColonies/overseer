import { Transparency, TileOutputFormat, RasterProductTypes, RASTER_DOMAIN } from '@map-colonies/raster-shared';
import { OperationStatus } from '@map-colonies/mc-priority-queue';
import type {
  ExportJob,
  IngestionNewFinalizeJob,
  IngestionNewInitJob,
  IngestionSwapUpdateFinalizeJob,
  IngestionUpdateFinalizeJob,
  IngestionUpdateInitJob,
} from '../../../src/utils/zod/schemas/job.schema';
import { Grid } from '../../../src/common/interfaces';
import { partsData } from './partsMockData';

/* eslint-disable @typescript-eslint/no-magic-numbers */

export const ingestionNewJob: IngestionNewInitJob = {
  id: 'de57d743-3155-4a28-86c8-9c181faabd94',
  resourceId: 'some_product',
  version: '1.0',
  type: 'Ingestion_New',
  description: '',
  parameters: {
    metadata: {
      srs: '4326',
      scale: 100000000,
      region: ['string'],
      srsName: 'WGS84GEO',
      productId: 'TestProduct',
      description: 'string',
      productName: 'akProduct',
      productType: RasterProductTypes.ORTHOPHOTO,
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
  domain: RASTER_DOMAIN,
  isCleaned: false,
  priority: 1000,
  expirationDate: new Date('2024-07-21T10:59:23.510Z'),
  internalId: '89bc4f63-8608-40bf-b845-3cbd4c0c4e03',
  producerName: 'string',
  productName: 'akProduct',
  productType: RasterProductTypes.ORTHOPHOTO,
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

export const ingestionNewJobExtended: IngestionNewFinalizeJob = {
  ...ingestionNewJob,
  parameters: {
    ...ingestionNewJob.parameters,
    metadata: {
      catalogId: '1844c1a5-d85d-4caf-9940-929eb6f818dc',
      displayPath: 'c1791a62-d0a3-4600-8e48-088d2a2dd145',
      layerRelativePath: '1844c1a5-d85d-4caf-9940-929eb6f818dc/c1791a62-d0a3-4600-8e48-088d2a2dd145',
      tileOutputFormat: TileOutputFormat.PNG,
      tileMimeType: 'image/png',
      grid: Grid.TWO_ON_ONE,
      ...ingestionNewJob.parameters.metadata,
    },
    additionalParams: {
      polygonPartsEntityName: 'some_polygon_parts_entity_name_orthophoto',
      jobTrackerServiceURL: 'http://job-tracker-service',
    },
  },
};

export const ingestionUpdateJob: IngestionUpdateInitJob = {
  id: 'd027b3aa-272b-4dc9-91d7-ba8343af5ed1',
  resourceId: 'some_product',
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
  domain: RASTER_DOMAIN,
  isCleaned: false,
  priority: 1000,
  expirationDate: new Date('2024-07-21T10:59:23.510Z'),
  internalId: 'a30e93fd-f1a7-480f-a395-47afc97f99b9',
  producerName: 'string',
  productName: 'akProduct',
  productType: RasterProductTypes.ORTHOPHOTO,
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

export const ingestionSwapUpdateJob: IngestionSwapUpdateFinalizeJob = {
  id: 'c023b3ba-272b-4dc9-92d7-ba8343af5ed9',
  resourceId: 'some_product',
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
      polygonPartsEntityName: 'some_polygon_parts_entity_name_orthophoto',
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
  domain: RASTER_DOMAIN,
  isCleaned: false,
  priority: 1000,
  expirationDate: new Date('2024-07-21T10:59:23.510Z'),
  internalId: 'f3ceebf1-3791-43db-967a-317c22ac1897',
  producerName: 'string',
  productName: 'akProduct',
  productType: RasterProductTypes.ORTHOPHOTO,
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

export const exportInitJob: ExportJob = {
  id: 'd78516d4-d815-4e0b-a8bd-88e0c434c928',
  resourceId: 'raster_shared_test_swap',
  version: '2.0',
  type: 'Export',
  description: 'This is roi exporting example',
  parameters: {
    additionalParams: {
      jobTrackerServiceURL: 'http://job-tracker-service',
      targetFormat: 'PNG',
      gpkgEstimatedSize: 2662500,
      fileNamesTemplates: {
        dataURI: 'RasterVectorBest_raster_shared_test_swap_2_0_20_2025_02_13T09_38_25_804Z.gpkg',
      },
      packageRelativePath: '04c2a753-4af3-41a5-a16d-1e9c3bec87b6/RasterVectorBest_raster_shared_test_swap_2_0_20_2025_02_13T09_38_25_804Z.gpkg',
      outputFormatStrategy: 'mixed',
      relativeDirectoryPath: '04c2a753-4af3-41a5-a16d-1e9c3bec87b6',
    },
    exportInputParams: {
      crs: 'EPSG:4326',
      roi: {
        type: 'FeatureCollection',
        features: [
          {
            bbox: [34.487134401539606, 31.52988565182776, 34.489134659773285, 31.531576751138154],
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [34.487134401539606, 31.52988565182776],
                  [34.489134659773285, 31.52988565182776],
                  [34.489134659773285, 31.531576751138154],
                  [34.487134401539606, 31.531576751138154],
                  [34.487134401539606, 31.52988565182776],
                ],
              ],
            },
            properties: {
              maxResolutionDeg: 6.70552253723145e-7,
              minResolutionDeg: 0.703125,
            },
          },
        ],
      },
      callbackUrls: [
        {
          url: 'http://example.getmap.com/callback',
        },
        {
          url: 'http://example.getmap.com/callback2',
        },
      ],
    },
  },
  status: OperationStatus.IN_PROGRESS,
  percentage: 0,
  reason: '',
  domain: RASTER_DOMAIN,
  isCleaned: false,
  priority: 0,
  expirationDate: new Date('2024-07-21T10:59:23.510Z'),
  internalId: '0b1e6b92-3587-4287-a4b7-6744c60f5add',
  producerName: 'string',
  productName: 'raster_shared_test_swap',
  productType: 'RasterVectorBest',
  additionalIdentifiers: '04c2a753-4af3-41a5-a16d-1e9c3bec87b6',
  taskCount: 0,
  completedTasks: 1,
  failedTasks: 1,
  expiredTasks: 0,
  pendingTasks: 0,
  inProgressTasks: 1,
  abortedTasks: 0,
  created: '2025-02-13T09:38:26.043Z',
  updated: '2025-02-13T11:34:15.878Z',
};

export const ingestionUpdateFinalizeJob: IngestionUpdateFinalizeJob = {
  ...ingestionUpdateJob,
  parameters: {
    ...ingestionUpdateJob.parameters,
    additionalParams: {
      polygonPartsEntityName: 'some_polygon_parts_entity_name_orthophoto',
      ...ingestionUpdateJob.parameters.additionalParams,
    },
  },
};

export const ingestionSwapUpdateFinalizeJob: IngestionSwapUpdateFinalizeJob = {
  ...ingestionSwapUpdateJob,
  parameters: {
    ...ingestionSwapUpdateJob.parameters,
    additionalParams: {
      ...ingestionSwapUpdateJob.parameters.additionalParams,
      displayPath: '391cf779-dfe0-42bd-9357-aaede47e4d37',
      polygonPartsEntityName: 'some_polygon_parts_entity_name_orthophoto',
    },
  },
};
