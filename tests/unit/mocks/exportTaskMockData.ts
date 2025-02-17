/* eslint-disable @typescript-eslint/no-magic-numbers */
import { type RoiFeatureCollection } from '@map-colonies/raster-shared';
import { LayerMetadata } from '@map-colonies/mc-model-types';
import { ITileRange } from '@map-colonies/mc-utils';
import { TaskSources } from '../../../src/common/interfaces';
import { layerRecord } from './catalogClientMockData';

export const mockRoi: RoiFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        maxResolutionDeg: 0.0001,
        minResolutionDeg: 0.001,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [34.85058011920469, 31.924579446269576],
            [34.85058011920469, 31.92424474199767],
            [34.85112549866784, 31.92424474199767],
            [34.85112549866784, 31.924579446269576],
            [34.85058011920469, 31.924579446269576],
          ],
        ],
      },
    },
  ],
};

export const nonIntersectingRoiCase: { roi: RoiFeatureCollection; targetLayerMetadata: LayerMetadata } = {
  roi: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          maxResolutionDeg: 0.0001,
          minResolutionDeg: 0.001,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [0, 1],
              [1, 1],
              [1, 0],
              [0, 0],
            ],
          ],
        },
      },
    ],
  },
  targetLayerMetadata: layerRecord.metadata,
};

export const exportTileRangeBatches: ITileRange[] = [
  {
    maxX: 2,
    maxY: 1,
    minX: 1,
    minY: 0,
    zoom: 0,
  },
  {
    maxX: 3,
    maxY: 2,
    minX: 2,
    minY: 1,
    zoom: 1,
  },
  {
    maxX: 5,
    maxY: 3,
    minX: 4,
    minY: 2,
    zoom: 2,
  },
  {
    maxX: 10,
    maxY: 6,
    minX: 9,
    minY: 5,
    zoom: 3,
  },
  {
    maxX: 20,
    maxY: 11,
    minX: 19,
    minY: 10,
    zoom: 4,
  },
  {
    maxX: 39,
    maxY: 22,
    minX: 38,
    minY: 21,
    zoom: 5,
  },
  {
    maxX: 77,
    maxY: 44,
    minX: 76,
    minY: 43,
    zoom: 6,
  },
  {
    maxX: 153,
    maxY: 87,
    minX: 152,
    minY: 86,
    zoom: 7,
  },
  {
    maxX: 306,
    maxY: 173,
    minX: 305,
    minY: 172,
    zoom: 8,
  },
  {
    maxX: 611,
    maxY: 346,
    minX: 610,
    minY: 345,
    zoom: 9,
  },
  {
    maxX: 1221,
    maxY: 692,
    minX: 1220,
    minY: 691,
    zoom: 10,
  },
  {
    maxX: 2441,
    maxY: 1383,
    minX: 2440,
    minY: 1382,
    zoom: 11,
  },
  {
    maxX: 4881,
    maxY: 2766,
    minX: 4880,
    minY: 2765,
    zoom: 12,
  },
  {
    maxX: 9762,
    maxY: 5532,
    minX: 9761,
    minY: 5530,
    zoom: 13,
  },
  {
    maxX: 19524,
    maxY: 11063,
    minX: 19523,
    minY: 11061,
    zoom: 14,
  },
  {
    maxX: 39047,
    maxY: 22125,
    minX: 39046,
    minY: 22123,
    zoom: 15,
  },
  {
    maxX: 78094,
    maxY: 44249,
    minX: 78092,
    minY: 44247,
    zoom: 16,
  },
  {
    maxX: 156187,
    maxY: 88497,
    minX: 156184,
    minY: 88495,
    zoom: 17,
  },
  {
    maxX: 312373,
    maxY: 176994,
    minX: 312369,
    minY: 176990,
    zoom: 18,
  },
  {
    maxX: 624745,
    maxY: 353987,
    minX: 624739,
    minY: 353981,
    zoom: 19,
  },
  {
    maxX: 1249490,
    maxY: 707973,
    minX: 1249478,
    minY: 707962,
    zoom: 20,
  },
];

export const exportTaskSources: TaskSources[] = [
  {
    path: '04c2a753-4af3-41a5-a16d-1e9c3bec87b6/RasterVectorBest_raster_shared_test_swap_2_0_20_2025_02_13T09_38_25_804Z.gpkg',
    type: 'GPKG',
    extent: {
      maxX: 34.489134659773285,
      maxY: 31.531576751138154,
      minX: 34.487134401539606,
      minY: 31.52988565182776,
    },
  },
  {
    path: '0b1e6b92-3587-4287-a4b7-6744c60f5add/13e9e17a-d585-450c-a4a3-a541bcf7aaa7',
    type: 'FS',
  },
];
