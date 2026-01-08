/* eslint-disable @typescript-eslint/no-magic-numbers */
import { faker } from '@faker-js/faker';
import { BBox, MultiPolygon, Polygon } from 'geojson';

type GeometryType = 'Polygon' | 'MultiPolygon' | 'random';

export function createFakeBBox(): BBox {
  return [
    faker.location.longitude({ min: -180, max: 180 }),
    faker.location.latitude({ min: -90, max: 90 }),
    faker.location.longitude({ min: -180, max: 180 }),
    faker.location.latitude({ min: -90, max: 90 }),
  ];
}

export function createFakePolygon(options?: { radiusInMeters?: number }): Polygon {
  const radius = options?.radiusInMeters ?? 1000;
  // Center point
  const centerLon = faker.location.longitude({ min: -180, max: 180 });
  const centerLat = faker.location.latitude({ min: -90, max: 90 });

  // Convert meters to approximate degrees (1 degree ≈ 111320 meters at equator)
  const radiusInDegrees = radius / 111320;

  // Create a simple square-like polygon around the center point
  const coordinates: number[][] = [];
  const numPoints = 4;

  for (let i = 0; i < numPoints; i++) {
    const angle = (i * 2 * Math.PI) / numPoints;
    const lon = centerLon + (radiusInDegrees * Math.cos(angle)) / Math.cos((centerLat * Math.PI) / 180);
    const lat = centerLat + radiusInDegrees * Math.sin(angle);
    coordinates.push([lon, lat]);
  }

  // Close the polygon by repeating the first point
  coordinates.push(coordinates[0]);

  return {
    type: 'Polygon',
    coordinates: [coordinates],
  };
}

export function createFakeMultiPolygon(options?: { polygonCount?: number; radiusInMeters?: number }): MultiPolygon {
  const count = options?.polygonCount ?? 3;
  const radius = options?.radiusInMeters ?? 1000;
  const polygonCoordinates: number[][][][] = [];

  for (let i = 0; i < count; i++) {
    const polygon = createFakePolygon({ radiusInMeters: radius });
    polygonCoordinates.push(polygon.coordinates);
  }

  return {
    type: 'MultiPolygon',
    coordinates: polygonCoordinates,
  };
}

export function createFakePolygonalGeometry(options?: { radiusInMeters?: number; geometryType?: GeometryType }): Polygon | MultiPolygon {
  const geometryType = options?.geometryType ?? 'random';
  const randomNumber = faker.number.int({ min: 0, max: 1 });
  const shouldReturnPolygon = geometryType === 'random' ? randomNumber === 0 : geometryType === 'Polygon';

  if (shouldReturnPolygon) {
    return createFakePolygon({ radiusInMeters: options?.radiusInMeters });
  } else {
    return createFakeMultiPolygon({ polygonCount: faker.number.int({ min: 1, max: 5 }), radiusInMeters: options?.radiusInMeters });
  }
}
