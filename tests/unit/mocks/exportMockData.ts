import { faker } from '@faker-js/faker';
import { CORE_VALIDATIONS, RoiFeature, RoiFeatureCollection } from '@map-colonies/raster-shared';
import { createFakePolygon } from './partsMockData';

export function createFakeRoiFeature(): RoiFeature {
  return {
    geometry: createFakePolygon(),
    type: 'Feature',
    properties: {
      maxResolutionDeg: faker.number.float(CORE_VALIDATIONS.resolutionDeg),
      minResolutionDeg: faker.number.float(CORE_VALIDATIONS.resolutionDeg),
    },
  };
}

export function createFakeRoiFeatureCollection(): RoiFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: Array.from({ length: faker.number.int({ min: 1, max: 10 }) }, createFakeRoiFeature),
  };
}
