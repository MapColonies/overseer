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
 * Splits a geometry into smaller sub-geometries based on tile count limitations.
 *
 * This function is used when a geometry at a specific zoom level would generate
 * more tiles than the maximum allowed per task. It divides the geometry into a
 * grid of smaller geometries, each containing approximately the maximum number
 * of tiles or fewer.
 *
 * The splitting process:
 * 1. Calculates the total number of tiles the geometry would generate at the given zoom level
 * 2. Determines the split factor (grid dimensions) needed to stay under the tile limit
 * 3. Creates a grid of bounding boxes that cover the original geometry
 * 4. Intersects each grid cell with the original geometry to create sub-geometries
 * 5. Returns only the intersecting geometries (non-empty intersections)
 *
 * @param geometry - The polygon or multipolygon to split
 * @param zoomLevel - The zoom level at which to calculate tile counts
 * @param maxTiles - The maximum number of tiles allowed per sub-geometry
 * @returns Array of sub-geometries, each containing at most maxTiles tiles
 *
 * @example
 * ```typescript
 * const largePolygon = { type: 'Polygon', coordinates: [...] };
 * const subGeometries = splitGeometryByTileCount(largePolygon, 18, 100000);
 * // Returns multiple smaller geometries, each generating ≤100,000 tiles at zoom 18
 * ```
 */
export function splitGeometryByTileCount(geometry: Polygon | MultiPolygon, zoomLevel: number, maxTiles: number): Feature<Polygon | MultiPolygon>[] {
  const geometryBbox = bbox(geometry);
  const [minX, minY, maxX, maxY] = geometryBbox;

  // Step 1: Calculate total tiles in the bbox
  // This gives us the worst-case scenario - how many tiles would be generated
  // if we rendered the entire bounding box at the given zoom level
  const totalTiles = featureToTilesCount(feature(geometry), zoomLevel);

  // Step 2: Calculate the split factor
  // The split factor determines how many pieces we need to divide the geometry into.
  // We use the square root because we're creating a 2D grid (splitFactor x splitFactor).
  //
  // Example: If totalTiles = 1,000,000 and maxTiles = 100,000:
  // - We need at least 10 pieces (1,000,000 / 100,000 = 10)
  // - For a square grid: √10 ≈ 3.16, so we need at least a 4x4 grid (16 pieces)
  // - This ensures each piece has ≤ 62,500 tiles (1,000,000 / 16)
  const splitFactor = Math.ceil(Math.sqrt(totalTiles / maxTiles));

  // Step 3: Calculate step sizes for the grid
  // Divide the bounding box into equal-sized rectangles
  // xStep = width of each grid cell, yStep = height of each grid cell
  const xStep = (maxX - minX) / splitFactor;
  const yStep = (maxY - minY) / splitFactor;

  const splitGeometries: Feature<Polygon | MultiPolygon>[] = [];

  // Step 4: Create grid of sub-geometries
  // Generate splitFactor x splitFactor grid cells and intersect each with the original geometry
  for (let i = 0; i < splitFactor; i++) {
    for (let j = 0; j < splitFactor; j++) {
      // Step 4a: Create bounding box for this grid cell
      // Each cell covers a rectangular area of the original bounding box
      const subBbox: BBox = [
        minX + i * xStep, // left edge
        minY + j * yStep, // bottom edge
        minX + (i + 1) * xStep, // right edge
        minY + (j + 1) * yStep, // top edge
      ];

      // Step 4b: Convert the grid cell bbox to a polygon
      const subPolygon = bboxPolygon(subBbox);

      // Step 4c: Find the intersection between the grid cell and original geometry
      // This gives us only the part of the original geometry that falls within this grid cell
      const intersection = intersect(featureCollection([subPolygon, feature(geometry)]));

      // Step 4d: Only keep non-empty intersections
      // Some grid cells might not overlap with the geometry at all (e.g., if geometry has holes or irregular shape)
      if (intersection) {
        splitGeometries.push(intersection);
      }
    }
  }

  return splitGeometries;
}
