import { degreesPerPixelToZoomLevel } from '@map-colonies/mc-utils';
import { PolygonPart } from '@map-colonies/raster-shared';

export const extractMaxUpdateZoomLevel = (partsData: PolygonPart[]): number => {
  const maxResolutionDeg = Math.min(...partsData.map((partData) => partData.resolutionDegree)); // best resolution
  const maxZoomLevel = degreesPerPixelToZoomLevel(maxResolutionDeg);
  return maxZoomLevel;
};
