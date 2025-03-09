import path from 'path';
import Database from 'better-sqlite3';
import jsLogger from '@map-colonies/js-logger';
import { GeoPackageClient } from '../../../src/utils/db/geoPackageClient';
import { configMock, registerDefaultConfig } from '../mocks/configMock';
import { tracerMock } from '../mocks/tracerMock';

jest.mock('better-sqlite3');

describe('geoPackageClient', () => {
  const gpkgFilename = 'test.gpkg';
  const tableName = 'test_table';
  let geoPackageClient: GeoPackageClient;
  const mockExec = jest.fn();
  const mockPrepare = jest.fn();
  const mockRun = jest.fn();
  const mockGet = jest.fn();
  const mockClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    registerDefaultConfig();

    // Mock Database implementation
    (Database as unknown as jest.Mock).mockImplementation(() => ({
      exec: mockExec,
      prepare: mockPrepare,
      close: mockClose,
    }));

    // Mock prepare return value
    mockPrepare.mockReturnValue({
      run: mockRun,
      get: mockGet,
    });

    geoPackageClient = new GeoPackageClient(jsLogger({ enabled: false }), tracerMock);
  });

  describe('createTableFromMetadata', () => {
    it('should create table and insert metadata successfully', () => {
      const gpkgsPath = configMock.get<string>('jobManagement.polling.jobs.export.gpkgsPath');
      const gpkgFilePath = path.join(gpkgsPath, gpkgFilename);
      const metadata = {
        testString: 'value',
        testNumber: 42,
        testFloat: 3.14,
      };

      mockGet.mockReturnValue(undefined); // Table doesn't exist initially

      const result = geoPackageClient.createTableFromMetadata(gpkgFilePath, metadata, tableName);

      expect(result).toBe(true);
      expect(Database).toHaveBeenCalledWith(gpkgFilePath, { readonly: false });
      expect(mockExec).toHaveBeenCalledWith('BEGIN TRANSACTION');
      expect(mockExec).toHaveBeenCalledWith('COMMIT');

      // Verify table creation
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE "test_table"'));

      // Verify data insertion
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO "test_table"'));
      expect(mockRun).toHaveBeenCalled();

      expect(mockClose).toHaveBeenCalled();
    });

    it('should drop existing table before creating new one', () => {
      const metadata = { test: 'value' };
      mockGet.mockReturnValue({ name: tableName }); // Table exists

      geoPackageClient.createTableFromMetadata(gpkgFilename, metadata, tableName);

      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('SELECT name FROM sqlite_master'));
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM gpkg_contents'));
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('DROP TABLE IF EXISTS'));
    });

    it('should handle transaction rollback on error', () => {
      const metadata = { test: 'value' };
      mockPrepare.mockImplementation(() => {
        throw new Error('Database error');
      });

      expect(() => geoPackageClient.createTableFromMetadata(gpkgFilename, metadata, tableName)).toThrow('Database error');

      expect(mockExec).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClose).toHaveBeenCalled();
    });

    it('should map metadata types correctly', () => {
      const metadata = {
        stringVal: 'text',
        integerVal: 42,
        floatVal: 3.14,
      };

      geoPackageClient.createTableFromMetadata(gpkgFilename, metadata, tableName);

      const expectedSQL = 'CREATE TABLE "test_table" ("string_val" TEXT, "integer_val" INTEGER, "float_val" REAL)';
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining(expectedSQL));
    });
  });
});
