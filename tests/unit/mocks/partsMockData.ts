/* eslint-disable @typescript-eslint/no-magic-numbers */
import { faker } from '@faker-js/faker';
import { BBox, Polygon } from 'geojson';
import { PolygonPart } from '@map-colonies/mc-model-types';
import { PartSourceContext } from '../../../src/common/interfaces';

function createFakeBBox(): BBox {
  return [
    faker.location.longitude({ min: -180, max: 180 }),
    faker.location.latitude({ min: -90, max: 90 }),
    faker.location.longitude({ min: -180, max: 180 }),
    faker.location.latitude({ min: -90, max: 90 }),
  ];
}

function createFakePolygon(): Polygon {
  const firstAndLastPoint = [faker.location.longitude({ min: -180, max: 180 }), faker.location.latitude({ min: -90, max: 90 })];
  return {
    type: 'Polygon',
    coordinates: [
      [
        firstAndLastPoint,
        [faker.location.longitude({ min: -180, max: 180 }), faker.location.latitude({ min: -90, max: 90 })],
        [faker.location.longitude({ min: -180, max: 180 }), faker.location.latitude({ min: -90, max: 90 })],
        [faker.location.longitude({ min: -180, max: 180 }), faker.location.latitude({ min: -90, max: 90 })],
        firstAndLastPoint,
      ],
    ],
  };
}

export const partsData: PolygonPart[] = [
  {
    sourceId: 'avi',
    sourceName: 'string',
    cities: ['string'],
    sensors: ['string'],
    footprint: {
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
    },
    countries: ['string'],
    description: 'string',
    resolutionMeter: 8000,
    resolutionDegree: 0.0439453125,
    imagingTimeEndUTC: '2024-01-28T13:47:43.427Z' as unknown as Date,
    imagingTimeBeginUTC: '2024-01-28T13:47:43.427Z' as unknown as Date,
    sourceResolutionMeter: 8000,
    horizontalAccuracyCE90: 10,
  },
];

export const multiPartData: PolygonPart[] = [
  { ...partsData[0] },
  {
    sourceId: 'avi',
    sourceName: 'string',
    cities: ['string'],
    sensors: ['string'],
    footprint: {
      type: 'Polygon',
      coordinates: [
        [
          [37.85149443279957, 30.30543192283443],
          [37.85149443279957, 30.29430955805424],
          [37.86824157112912, 30.29430955805424],
          [37.86824157112912, 30.30543192283443],
          [37.85149443279957, 30.30543192283443],
        ],
      ],
    },
    countries: ['string'],
    description: 'string',
    resolutionMeter: 8000,
    resolutionDegree: 0.0439453125,
    imagingTimeEndUTC: '2024-01-28T13:47:43.427Z' as unknown as Date,
    imagingTimeBeginUTC: '2024-01-28T13:47:43.427Z' as unknown as Date,
    sourceResolutionMeter: 8000,
    horizontalAccuracyCE90: 10,
  },
];

export const multiPartDataWithDifferentResolution: PolygonPart[] = [
  {
    sourceId: 'westBank1',
    sourceName: 'westBank1',
    imagingTimeBeginUTC: '2024-01-28T13:47:43.427Z' as unknown as Date,
    imagingTimeEndUTC: '2024-01-28T13:47:43.427Z' as unknown as Date,
    resolutionDegree: 0.00000536441802978516,
    resolutionMeter: 8000,
    sourceResolutionMeter: 8000,
    horizontalAccuracyCE90: 10,
    sensors: ['string'],
    countries: ['israel'],
    cities: ['string'],
    description: 'string',
    footprint: {
      type: 'Polygon',
      coordinates: [
        [
          [35.158446992306125, 32.27601024007666],
          [35.158446992306125, 32.20366374788796],
          [35.185582788965576, 32.20366374788796],
          [35.185582788965576, 32.27601024007666],
          [35.158446992306125, 32.27601024007666],
        ],
      ],
    },
  },
  {
    sourceId: 'westBank2',
    sourceName: 'westBank2',
    imagingTimeBeginUTC: '2024-01-28T13:47:43.427Z' as unknown as Date,
    imagingTimeEndUTC: '2024-01-28T13:47:43.427Z' as unknown as Date,
    resolutionDegree: 0.00000268220901489258,
    resolutionMeter: 8000,
    sourceResolutionMeter: 8000,
    horizontalAccuracyCE90: 10,
    sensors: ['string'],
    countries: ['israel'],
    cities: ['string'],
    description: 'string',
    footprint: {
      type: 'Polygon',
      coordinates: [
        [
          [35.32734623646951, 32.276804622865185],
          [35.32734623646951, 32.199128287114874],
          [35.35946926365148, 32.199128287114874],
          [35.35946926365148, 32.276804622865185],
          [35.32734623646951, 32.276804622865185],
        ],
      ],
    },
  },
];

export function createFakePartSource(): PartSourceContext {
  return {
    tilesPath: `${faker.string.uuid()}/${faker.string.uuid()}`,
    fileName: `${faker.string.alpha({ length: 8 })}.gpkg`,
    maxZoom: faker.number.int({ min: 0, max: 21 }),
    extent: createFakeBBox(),
    footprint: createFakePolygon(),
  };
}
