import { PolygonPart } from '@map-colonies/raster-shared';
import { feature, featureCollection, union, bbox, bboxPolygon, intersect } from '@turf/turf';
import { featureToTilesCount } from '@map-colonies/mc-utils';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { BBox } from 'geojson';

/**
 * Helper function to unify multiple polygon parts into a single geometry.
 */
export function unifyParts(parts: PolygonPart[]): Feature<Polygon | MultiPolygon> | null {
  if (parts.length === 1) {
    return feature(parts[0].footprint);
  }
  const polygons = parts.map((part) => feature(part.footprint));
  const collection = featureCollection(polygons);
  const footprint = union(collection);
  return footprint;
}

/**
 * Helper function to split geometry by tile count.
 */
export function splitGeometryByTileCount(geometry: Polygon | MultiPolygon, zoomLevel: number, maxTiles: number): Feature<Polygon | MultiPolygon>[] {
  const geometryBbox = bbox(geometry);
  const [minX, minY, maxX, maxY] = geometryBbox;

  // Calculate total tiles in the bbox
  const totalTiles = featureToTilesCount(feature(geometry), zoomLevel);
  const splitFactor = Math.ceil(Math.sqrt(totalTiles / maxTiles));

  // Calculate step sizes for splitting
  const xStep = (maxX - minX) / splitFactor;
  const yStep = (maxY - minY) / splitFactor;

  const splitGeometries: Feature<Polygon | MultiPolygon>[] = [];

  // Create grid of sub-geometries
  for (let i = 0; i < splitFactor; i++) {
    for (let j = 0; j < splitFactor; j++) {
      const subBbox: BBox = [minX + i * xStep, minY + j * yStep, minX + (i + 1) * xStep, minY + (j + 1) * yStep];

      const subPolygon = bboxPolygon(subBbox);
      const intersection = intersect(featureCollection([subPolygon, feature(geometry)]));

      if (intersection) {
        splitGeometries.push(intersection);
      }
    }
  }

  return splitGeometries;
}
