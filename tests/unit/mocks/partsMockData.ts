/* eslint-disable @typescript-eslint/no-magic-numbers */
import { faker } from '@faker-js/faker';
import { BBox, MultiPolygon, Polygon } from 'geojson';
import { PolygonFeature, PPFeatureCollection } from '../../../src/common/interfaces';

export function createFakeBBox(): BBox {
  return [
    faker.location.longitude({ min: -180, max: 180 }),
    faker.location.latitude({ min: -90, max: 90 }),
    faker.location.longitude({ min: -180, max: 180 }),
    faker.location.latitude({ min: -90, max: 90 }),
  ];
}

export function createFakePolygon(): Polygon {
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

export function createFakeMultiPolygon(polygonCount: number = 3): MultiPolygon {
  const polygonCoordinates: number[][][][] = [];

  for (let i = 0; i < polygonCount; i++) {
    const polygon = createFakePolygon();
    polygonCoordinates.push(polygon.coordinates);
  }

  return {
    type: 'MultiPolygon',
    coordinates: polygonCoordinates,
  };
}

export function createFakeRandomPolygonalGeometry(): Polygon | MultiPolygon {
  const randomNumber = faker.number.int({ min: 0, max: 1 });
  if (randomNumber === 0) {
    return createFakePolygon();
  }
  return createFakeMultiPolygon(faker.number.int({ min: 1, max: 5 }));
}

export function createFakePolygonFeature(): PolygonFeature {
  return {
    geometry: createFakePolygon(),
    type: 'Feature',
    properties: {
      maxZoom: faker.number.int({ min: 0, max: 20 }),
    },
  };
}

export function createFakeFeatureCollection(): PPFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: Array.from({ length: faker.number.int({ min: 1, max: 10 }) }, createFakePolygonFeature),
  };
}
