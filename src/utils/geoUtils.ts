import { Feature, Polygon } from 'geojson';
import { Footprint } from '@map-colonies/mc-utils';

// we need to use FootprintFeature because turf supporting this type
export type FootprintFeature = Feature<Polygon>;

export const convertToFeature = (footprint: Footprint): FootprintFeature => {
  if ('type' in footprint && footprint.type === 'Feature' && footprint.geometry.type === 'Polygon') {
    return footprint as Feature<Polygon>; // making this assertion because we know for sure the FootPrint feature is of type polygon (which is the only geometry we support)
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if ('type' in footprint && footprint.type === 'Polygon') {
    return {
      type: 'Feature',
      geometry: footprint,
      properties: {},
    };
  }

  throw new Error('Unsupported footprint type');
};
