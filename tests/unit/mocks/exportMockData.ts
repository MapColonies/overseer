import { faker } from '@faker-js/faker';
import { RoiFeature, RoiFeatureCollection } from '@map-colonies/raster-shared';
import { createFakePolygon } from './partsMockData';

export function createFakeRoiFeature(): RoiFeature {
  return {
    geometry: createFakePolygon(),
    type: 'Feature',
    properties: {
      maxResolutionDeg: faker.number.float({ min: 0, max: 1 }),
      minResolutionDeg: faker.number.float({ min: 0, max: 1 }),
    },
  };
}

export function createFakeRoiFeatureCollection(): RoiFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: Array.from({ length: faker.number.int({ min: 1, max: 10 }) }, createFakeRoiFeature),
  };
}
