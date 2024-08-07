import { NewRasterLayer, ProductType, Transparency, UpdateRasterLayer } from '@map-colonies/mc-model-types';
import { IJobResponse, OperationStatus } from '@map-colonies/mc-priority-queue';
import { PolygonPart } from '@map-colonies/mc-model-types';

/* eslint-disable @typescript-eslint/no-magic-numbers */
const partData: PolygonPart[] = [
  {
    id: 'avi',
    name: 'string',
    cities: ['string'],
    sensors: ['string'],
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [34.85149443279957, 32.30543192283443],
          [34.85149443279957, 32.29430955805424],
          [34.86824157112912, 32.29430955805424],
          [34.86824157112912, 32.30543192283443],
          [34.85149443279957, 32.30543192283443],
        ],
      ],
    } as unknown as GeoJSON.Polygon,
    countries: ['string'],
    description: 'string',
    resolutionMeter: 8000,
    resolutionDegree: 0.703125,
    imagingTimeEndUTC: '2024-01-28T13:47:43.427Z' as unknown as Date,
    imagingTimeBeginUTC: '2024-01-28T13:47:43.427Z' as unknown as Date,
    sourceResolutionMeter: 8000,
    horizontalAccuracyCE90: 10,
  },
];

export const ingestionNewJob: IJobResponse<NewRasterLayer, unknown> = {
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
    partData,
    inputFiles: {
      fileNames: ['blueMarble.gpkg'],
      originDirectory: 'tests',
    },
  },
  status: OperationStatus.PENDING,
  percentage: 0,
  reason: '',
  domain: 'RASTER',
  isCleaned: false,
  priority: 1000,
  expirationDate: '2024-07-21T10:59:23.510Z' as unknown as Date,
  internalId: 'some-internal-id',
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

export const ingestionUpdateJob: IJobResponse<UpdateRasterLayer, unknown> = {
  id: 'd027b3aa-272b-4dc9-91d7-ba8343af5ed1',
  resourceId: 'another-product-id',
  version: '1.0',
  type: 'Ingestion_Update',
  description: '',
  parameters: {
    metadata: {
      classification: '6',
    },
    partData,
    inputFiles: {
      fileNames: ['blueMarble.gpkg'],
      originDirectory: 'tests',
    },
  },
  status: OperationStatus.PENDING,
  percentage: 0,
  reason: '',
  domain: 'RASTER',
  isCleaned: false,
  priority: 1000,
  expirationDate: '2024-07-21T10:59:23.510Z' as unknown as Date,
  internalId: '2024-07-21T10:59:23.510Z',
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

export const ingestionSwapUpdateJob: IJobResponse<UpdateRasterLayer, unknown> = {
  id: 'c023b3ba-272b-4dc9-92d7-ba8343af5ed9',
  resourceId: 'another-product-id',
  version: '1.0',
  type: 'Ingestion_Swap_Update',
  description: '',
  parameters: {
    metadata: {
      classification: '6',
    },
    partData,
    inputFiles: {
      fileNames: ['blueMarble.gpkg'],
      originDirectory: 'tests',
    },
  },
  status: OperationStatus.PENDING,
  percentage: 0,
  reason: '',
  domain: 'RASTER',
  isCleaned: false,
  priority: 1000,
  expirationDate: '2024-07-21T10:59:23.510Z' as unknown as Date,
  internalId: 'some-internal-id',
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
