import { sep } from 'path';
import { ZodError } from 'zod';
import jsLogger from '@map-colonies/js-logger';
import { RasterLayerMetadata, SourceType } from '@map-colonies/raster-shared';
import { extentSchema, tileRangeArraySchema } from '../../utils/schemas/export.schema';
import {} from '@turf/turf';
import { configMock, init, registerDefaultConfig, setValue } from '../../mocks/configMock';
import { mockRoi, nonIntersectingRoiCase } from '../../mocks/exportTaskMockData';
import { layerRecord } from '../../mocks/catalogClientMockData';
import { StorageProvider } from '../../../../src/common/constants';
import { exportJob } from '../../mocks/jobsMockData';
import { ExportTaskManager } from '../../../../src/task/models/exportTaskManager';
import { tracerMock } from '../../mocks/tracerMock';
import { setupExportTaskBuilderTest } from './exportTaskManagerSetup';

describe('exportTaskManager', () => {
  beforeEach(() => {
    registerDefaultConfig();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateTileRangeBatches', () => {
    it('should generate tile range batches successfully', () => {
      const { exportTaskManager } = setupExportTaskBuilderTest();
      const { metadata } = layerRecord;

      const batches = exportTaskManager.generateTileRangeBatches(mockRoi, metadata);

      const isBatchesValid = tileRangeArraySchema.safeParse(batches).success;

      expect(batches.length).toBeGreaterThan(0);
      expect(isBatchesValid).toBe(true);
    });

    it('should handle invalid footprint and throw zod validation error', () => {
      const { exportTaskManager } = setupExportTaskBuilderTest();
      const { metadata } = layerRecord;

      const invalidLayerMetadata = { ...metadata, footprint: { type: 'Invalid' } };

      const action = () => exportTaskManager.generateTileRangeBatches(mockRoi, invalidLayerMetadata as RasterLayerMetadata);

      expect(action).toThrow(ZodError);
    });

    it('should handle roi that not intersecting with layer footprint and throw error', () => {
      const { exportTaskManager } = setupExportTaskBuilderTest();
      const { roi, targetLayerMetadata } = nonIntersectingRoiCase;

      const action = () => exportTaskManager.generateTileRangeBatches(roi, targetLayerMetadata);

      expect(action).toThrow(Error);
    });
  });

  describe('generateSources', () => {
    it('should generate sources successfully', () => {
      const { exportTaskManager } = setupExportTaskBuilderTest();
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const tilesStorageProvider = configMock.get<string>('tilesStorageProvider');
      const separator = tilesStorageProvider === StorageProvider.S3 ? '/' : sep;
      const expectedPath = `${layerRecord.metadata.id}${separator}${layerRecord.metadata.displayPath}`;
      const job = exportJob;
      const { metadata } = layerRecord;

      const sources = exportTaskManager.generateSources(job, metadata);

      const [source1, source2] = sources;
      const isExtentExistInSource1 = extentSchema.safeParse(source1.extent).success;

      expect(sources).toHaveLength(2);
      expect(source1.type).toBe(SourceType.GPKG);
      expect(source1.path).toBe(job.parameters.additionalParams.packageRelativePath);
      expect(isExtentExistInSource1).toBe(true);
      expect(source2.type).toBe(tilesStorageProvider);
      expect(source2.path).toBe(expectedPath);
    });

    it('should throw an error when the roi is invalid', () => {
      const { exportTaskManager } = setupExportTaskBuilderTest();
      const job = exportJob;

      job.parameters.exportInputParams.roi.features[0].geometry.type = 'invalidType' as 'Polygon';
      const { metadata } = layerRecord;

      const action = () => exportTaskManager.generateSources(job, metadata);

      expect(action).toThrow(Error);
    });
  });

  describe('private methods', () => {
    describe('getSeparator', () => {
      const mockLogger = jsLogger({ enabled: false });

      it('should return / for S3 storage provider', () => {
        setValue('tilesStorageProvider', 'S3');
        init();
        const exportTaskManager = new ExportTaskManager(mockLogger, configMock, tracerMock);
        const result = exportTaskManager['getSeparator']();
        expect(result).toBe('/');
      });

      it(`should return sep operator(${sep}) for FS storage provider`, () => {
        setValue('tilesStorageProvider', 'FS');
        init();
        const exportTaskManager = new ExportTaskManager(mockLogger, configMock, tracerMock);
        const result = exportTaskManager['getSeparator']();
        expect(result).toBe(sep);
      });
    });
  });
});
