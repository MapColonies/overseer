import { Feature, Polygon, MultiPolygon } from 'geojson';
import { Footprint } from '@map-colonies/mc-utils';

export type FootprintFeature = Feature<Polygon | MultiPolygon>;

export const convertToFeature = (footprint: Footprint): FootprintFeature => {
  if ('type' in footprint && (footprint.type === 'Polygon' || footprint.type === 'MultiPolygon')) {
    return {
      type: 'Feature',
      geometry: footprint,
      properties: {},
    };
  }

  throw new Error('Unsupported footprint type');
};
