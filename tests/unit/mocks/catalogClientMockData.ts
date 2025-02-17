import { ProductType, RecordType } from '@map-colonies/types';
import { FindLayerResponse } from '../../../src/common/interfaces';

/* eslint-disable @typescript-eslint/no-magic-numbers */
export const layerRecord: FindLayerResponse = {
  links: [
    {
      name: 'raster_shared_test_swap-RasterVectorBest',
      protocol: 'WMS',
      url: 'https://tiles-dev.mapcolonies.net/api/raster/v1/service?REQUEST=GetCapabilities',
    },
    {
      name: 'raster_shared_test_swap-RasterVectorBest',
      protocol: 'WMS_BASE',
      url: 'https://tiles-dev.mapcolonies.net/api/raster/v1/wms',
    },
    {
      name: 'raster_shared_test_swap-RasterVectorBest',
      protocol: 'WMTS',
      url: 'https://tiles-dev.mapcolonies.net/api/raster/v1/wmts/1.0.0/WMTSCapabilities.xml',
    },
    {
      name: 'raster_shared_test_swap-RasterVectorBest',
      protocol: 'WMTS_KVP',
      url: 'https://tiles-dev.mapcolonies.net/api/raster/v1/service?REQUEST=GetCapabilities&SERVICE=WMTS',
    },
    {
      name: 'raster_shared_test_swap-RasterVectorBest',
      protocol: 'WMTS_BASE',
      url: 'https://tiles-dev.mapcolonies.net/api/raster/v1/wmts',
    },
    {
      name: 'raster_shared_test_swap-RasterVectorBest',
      protocol: 'WFS',
      url: 'https://polygon-parts-dev.mapcolonies.net/api/raster/v1/wfs?request=GetCapabilities',
    },
  ],
  metadata: {
    id: '0b1e6b92-3587-4287-a4b7-6744c60f5add',
    type: RecordType.RECORD_RASTER,
    classification: '1',
    productName: 'different_zoom_level_israel_and argentina',
    description: 'string',
    srs: '4326',
    producerName: 'string',
    creationDateUTC: new Date('2025-02-03T13:12:12.257Z'),
    ingestionDate: new Date('2025-02-03T13:12:12.257Z'),
    updateDateUTC: new Date('2025-02-03T13:13:36.975Z'),
    imagingTimeBeginUTC: new Date('2024-01-28T13:47:43.427Z'),
    imagingTimeEndUTC: new Date('2024-01-28T13:47:43.427Z'),
    maxHorizontalAccuracyCE90: 10,
    minHorizontalAccuracyCE90: 10,
    sensors: ['string'],
    region: ['אלמוג בדיקןת'],
    productId: 'raster_shared_test_swap',
    productVersion: '2.0',
    productType: ProductType.RASTER_VECTOR_BEST,
    productSubType: 'עבירות',
    srsName: 'WGS84GEO',
    maxResolutionDeg: 6.70552253723145e-7,
    minResolutionDeg: 6.70552253723145e-7,
    maxResolutionMeter: 78271.52,
    minResolutionMeter: 78271.52,
    scale: 100000000,
    footprint: {
      type: 'Polygon',
      coordinates: [
        [
          [34.83923632256145, 31.922419235981152],
          [34.87784176712384, 31.910180368281715],
          [34.89198290584966, 31.910733573065897],
          [34.87123279663652, 31.938058001772205],
          [34.86630864817516, 31.938047130776454],
          [34.86443726005933, 31.943037442121934],
          [34.85653763818232, 31.941683304622828],
          [34.83923632256145, 31.922419235981152],
        ],
      ],
    },
    productBoundingBox: '34.487051303999998,31.529771606536066,34.489237277918683,31.531643735571542',
    displayPath: '13e9e17a-d585-450c-a4a3-a541bcf7aaa7',
    transparency: 'TRANSPARENT',
    tileMimeFormat: 'image/png',
    tileOutputFormat: 'PNG',
  },
};
