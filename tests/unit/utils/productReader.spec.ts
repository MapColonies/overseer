/* eslint-disable @typescript-eslint/unbound-method */
import { join } from 'path';
import jsLogger from '@map-colonies/js-logger';
import { ShapefileChunkReader, ShapefileChunk } from '@map-colonies/mc-utils';
import { Feature, Polygon, MultiPolygon } from 'geojson';
import { DependencyContainer } from 'tsyringe';
import { SERVICES } from '../../../src/common/constants';
import { ProductReadError } from '../../../src/common/errors';
import { productReaderFactory, validateProduct } from '../../../src/utils/storage/productReader';
import { configMock, registerDefaultConfig } from '../mocks/configMock';
import { createFakePolygon, createFakeMultiPolygon } from '../mocks/geometryMockData';
import { mockShapefileReader } from '../mocks/productReaderMock';

jest.mock('@map-colonies/mc-utils');

describe('productReader', () => {
  registerDefaultConfig();
  let mockContainer: DependencyContainer;
  const mockLogger = jsLogger({ enabled: false });
  const testProductPath = 'test/Product.shp';
  const testIngestionSourcesDir = configMock.get<string>('ingestionSourcesDirPath');
  const fullProductPath = join(testIngestionSourcesDir, testProductPath);
  const maxVerticesPerChunk = configMock.get<number>('shapefileReader.maxVerticesPerChunk');

  beforeEach(() => {
    jest.clearAllMocks();
    registerDefaultConfig();

    mockContainer = {
      resolve: jest.fn((token: symbol) => {
        if (token === SERVICES.CONFIG) {
          return configMock;
        }
        if (token === SERVICES.LOGGER) {
          return mockLogger;
        }
        return undefined;
      }),
    } as unknown as DependencyContainer;
  });

  describe('productReaderFactory', () => {
    it('should create a function that reads product geometry from shapefile (Polygon)', async () => {
      const mockPolygon = createFakePolygon();
      const mockFeature: Feature<Polygon> = {
        type: 'Feature',
        properties: {},
        geometry: mockPolygon,
      };
      const mockChunk: ShapefileChunk = {
        features: [mockFeature],
        skippedFeatures: [],
        skippedVerticesCount: 0,
        id: 1,
        verticesCount: 100,
      };

      const mockReadAndProcess = mockShapefileReader(mockChunk);

      const readProductGeometry = productReaderFactory(mockContainer);
      const result = await readProductGeometry(testProductPath);

      expect(result).toEqual(mockPolygon);
      expect(mockReadAndProcess).toHaveBeenCalledWith(fullProductPath, expect.any(Object));
      expect(ShapefileChunkReader).toHaveBeenCalledWith({ maxVerticesPerChunk, generateFeatureId: true });
    });

    it('should create a function that reads product geometry from shapefile (MultiPolygon)', async () => {
      const mockMultiPolygon = createFakeMultiPolygon();
      const mockFeature: Feature<MultiPolygon> = {
        type: 'Feature',
        properties: {},
        geometry: mockMultiPolygon,
      };
      const mockChunk: ShapefileChunk = {
        features: [mockFeature],
        skippedFeatures: [],
        skippedVerticesCount: 0,
        id: 1,
        verticesCount: 100,
      };

      const mockReadAndProcess = mockShapefileReader(mockChunk);

      const readProductGeometry = productReaderFactory(mockContainer);
      const result = await readProductGeometry(testProductPath);

      expect(result).toEqual(mockMultiPolygon);
      expect(mockReadAndProcess).toHaveBeenCalledWith(fullProductPath, expect.any(Object));
    });

    it('should throw ProductReadError when no geometry is found in shapefile', async () => {
      const mockChunk: ShapefileChunk = {
        features: [],
        skippedFeatures: [],
        skippedVerticesCount: 0,
        id: 1,
        verticesCount: 100,
      };

      mockShapefileReader(mockChunk);

      const readProductGeometry = productReaderFactory(mockContainer);

      await expect(readProductGeometry(testProductPath)).rejects.toThrow(ProductReadError);
    });

    it('should throw ProductReadError when shapefile reader fails', async () => {
      const readError = new Error('Failed to read shapefile');
      const mockReadAndProcess = jest.fn().mockRejectedValue(readError);

      (ShapefileChunkReader as jest.Mock).mockImplementation(() => ({
        readAndProcess: mockReadAndProcess,
      }));

      const readProductGeometry = productReaderFactory(mockContainer);

      await expect(readProductGeometry(testProductPath)).rejects.toThrow(ProductReadError);
    });

    it('should throw ProductReadError when chunk contains multiple features', async () => {
      const mockPolygon = createFakePolygon();
      const mockFeature1: Feature<Polygon> = {
        type: 'Feature',
        properties: {},
        geometry: mockPolygon,
      };
      const mockFeature2: Feature<Polygon> = {
        type: 'Feature',
        properties: {},
        geometry: mockPolygon,
      };
      const mockChunk: ShapefileChunk = {
        features: [mockFeature1, mockFeature2],
        skippedFeatures: [],
        skippedVerticesCount: 0,
        id: 1,
        verticesCount: 200,
      };

      mockShapefileReader(mockChunk);

      const readProductGeometry = productReaderFactory(mockContainer);

      await expect(readProductGeometry(testProductPath)).rejects.toThrow(ProductReadError);
    });
  });

  describe('validateProduct', () => {
    it('should return undefined for empty chunk with no features', () => {
      const emptyChunk: ShapefileChunk = {
        features: [],
        skippedFeatures: [],
        skippedVerticesCount: 0,
        id: 1,
        verticesCount: 0,
      };

      const result = validateProduct(emptyChunk, maxVerticesPerChunk);

      expect(result).toBeUndefined();
    });

    it('should validate and return a valid Polygon feature', () => {
      const mockPolygon = createFakePolygon();
      const mockFeature: Feature<Polygon> = {
        type: 'Feature',
        properties: {},
        geometry: mockPolygon,
      };
      const chunk: ShapefileChunk = {
        features: [mockFeature],
        skippedFeatures: [],
        skippedVerticesCount: 0,
        id: 1,
        verticesCount: 100,
      };

      const result = validateProduct(chunk, maxVerticesPerChunk);

      expect(result).toBeDefined();
      expect(result?.geometry).toEqual(mockPolygon);
      expect(result?.geometry.type).toBe('Polygon');
    });

    it('should validate and return a valid MultiPolygon feature', () => {
      const mockMultiPolygon = createFakeMultiPolygon();
      const mockFeature: Feature<MultiPolygon> = {
        type: 'Feature',
        properties: {},
        geometry: mockMultiPolygon,
      };
      const chunk: ShapefileChunk = {
        features: [mockFeature],
        skippedFeatures: [],
        skippedVerticesCount: 0,
        id: 1,
        verticesCount: 100,
      };

      const result = validateProduct(chunk, maxVerticesPerChunk);

      expect(result).toBeDefined();
      expect(result?.geometry).toEqual(mockMultiPolygon);
      expect(result?.geometry.type).toBe('MultiPolygon');
    });

    it('should throw error when chunk contains multiple features', () => {
      const mockPolygon = createFakePolygon();
      const mockFeature1: Feature<Polygon> = {
        type: 'Feature',
        properties: {},
        geometry: mockPolygon,
      };
      const mockFeature2: Feature<Polygon> = {
        type: 'Feature',
        properties: {},
        geometry: mockPolygon,
      };
      const chunk: ShapefileChunk = {
        features: [mockFeature1, mockFeature2],
        skippedFeatures: [],
        skippedVerticesCount: 0,
        id: 1,
        verticesCount: 200,
      };

      expect(() => validateProduct(chunk, maxVerticesPerChunk)).toThrow();
    });

    it('should throw error when chunk contains multiple skipped features', () => {
      const mockPolygon = createFakePolygon();
      const mockSkippedFeature1: Feature<Polygon> = {
        type: 'Feature',
        properties: {},
        geometry: mockPolygon,
      };
      const mockSkippedFeature2: Feature<Polygon> = {
        type: 'Feature',
        properties: {},
        geometry: mockPolygon,
      };
      const chunk: ShapefileChunk = {
        features: [],
        skippedFeatures: [mockSkippedFeature1, mockSkippedFeature2],
        skippedVerticesCount: 0,
        id: 1,
        verticesCount: 200,
      };

      expect(() => validateProduct(chunk, maxVerticesPerChunk)).toThrow();
    });

    it('should throw error when product exceeds maximum allowed vertices', () => {
      const mockPolygon = createFakePolygon();
      const mockSkippedFeature: Feature<Polygon> = {
        type: 'Feature',
        properties: {},
        geometry: mockPolygon,
      };
      const chunk: ShapefileChunk = {
        features: [],
        skippedFeatures: [mockSkippedFeature],
        skippedVerticesCount: 15000,
        id: 1,
        verticesCount: 0,
      };

      expect(() => validateProduct(chunk, maxVerticesPerChunk)).toThrow();
    });
  });
});
