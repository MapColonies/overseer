/* eslint-disable @typescript-eslint/unbound-method */
import fs from 'fs/promises';
import { Dirent, Stats } from 'fs';
import path from 'path';
import jsLogger from '@map-colonies/js-logger';
import { FSService } from '../../../src/utils/storage/fsService';
import { tracerMock } from '../mocks/tracerMock';
import { FSError } from '../../../src/common/errors';

jest.mock('fs/promises');
jest.mock('path');

describe('fsService', () => {
  let fsService: FSService;
  const testFilePath = '/path/to/test/file.gpkg';
  const testDirPath = '/path/to/test';
  const mockFilesList: Dirent[] = [new Dirent()];
  const mockEmptyList: Dirent[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    fsService = new FSService(jsLogger({ enabled: false }), tracerMock);
  });

  describe('uploadJsonFile', () => {
    const testJsonPath = '/path/to/test/file.json';
    const testJsonData = {
      id: 'test123',
      name: 'Test Layer',
      properties: { resolution: 0.5, type: 'orthophoto' },
    };
    const expectedSha256 = 'mocked-sha256-hash';

    it('should write JSON data to file and return SHA256 hash', async () => {
      const writeFileMock = jest.mocked(fs.writeFile).mockResolvedValue(undefined);

      const generateSha256Spy = jest.spyOn(fsService as unknown as { generateSha256: jest.Func }, 'generateSha256').mockReturnValue(expectedSha256);

      const result = await fsService.uploadJsonFile(testJsonPath, testJsonData);

      expect(result).toBe(expectedSha256);
      expect(writeFileMock).toHaveBeenCalledWith(testJsonPath, JSON.stringify({ ...testJsonData, sha256: expectedSha256 }, null, 2));
      expect(generateSha256Spy).toHaveBeenCalledWith(testJsonData);
    });

    it('should throw FSError when writing file fails', async () => {
      const writeError = new Error('Write failed');
      jest.mocked(fs.writeFile).mockRejectedValue(writeError);

      jest.spyOn(fsService as unknown as { generateSha256: jest.Func }, 'generateSha256').mockReturnValue(expectedSha256);

      await expect(fsService.uploadJsonFile(testJsonPath, testJsonData)).rejects.toThrow(FSError);
      await expect(fsService.uploadJsonFile(testJsonPath, testJsonData)).rejects.toThrow(`Failed to upload JSON file ${testJsonPath}`);
    });
  });

  describe('deleteFile', () => {
    it('should delete a file successfully', async () => {
      const unlinkMock = jest.mocked(fs.unlink).mockResolvedValue(undefined);

      await fsService.deleteFile(testFilePath);

      expect(unlinkMock).toHaveBeenCalledWith(testFilePath);
    });

    it('should throw FSError when file deletion fails', async () => {
      const deleteError = new Error('File not found');
      jest.mocked(fs.unlink).mockRejectedValue(deleteError);

      await expect(fsService.deleteFile(testFilePath)).rejects.toThrow(FSError);
    });
  });

  describe('deleteDirectory', () => {
    it('should delete an empty directory successfully', async () => {
      jest.mocked(fs.readdir).mockResolvedValue(mockEmptyList);
      const rmdirMock = jest.mocked(fs.rmdir).mockResolvedValue(undefined);

      const result = await fsService.deleteDirectory(testDirPath);

      expect(result).toBe(true);
      expect(fs.readdir).toHaveBeenCalledWith(testDirPath);
      expect(rmdirMock).toHaveBeenCalledWith(testDirPath);
    });

    it('should not delete a non-empty directory without force option', async () => {
      jest.mocked(fs.readdir).mockResolvedValue(mockFilesList);

      const result = await fsService.deleteDirectory(testDirPath);

      expect(result).toBe(false);
      expect(fs.readdir).toHaveBeenCalledWith(testDirPath);
      expect(fs.rmdir).not.toHaveBeenCalled();
      expect(fs.rm).not.toHaveBeenCalled();
    });

    it('should delete a non-empty directory when force option is true', async () => {
      jest.mocked(fs.readdir).mockResolvedValue(mockFilesList);
      const rmMock = jest.mocked(fs.rm).mockResolvedValue(undefined);

      const result = await fsService.deleteDirectory(testDirPath, { force: true });

      expect(result).toBe(true);
      expect(fs.readdir).toHaveBeenCalledWith(testDirPath);
      expect(rmMock).toHaveBeenCalledWith(testDirPath, { recursive: true, force: true });
    });

    it('should throw FSError when directory deletion fails', async () => {
      const readError = new Error('Directory not found');
      jest.mocked(fs.readdir).mockRejectedValue(readError);

      await expect(fsService.deleteDirectory(testDirPath)).rejects.toThrow(FSError);
    });
  });

  describe('deleteFileAndParentDir', () => {
    it('should delete file and its parent directory if empty', async () => {
      jest.mocked(path.dirname).mockReturnValue(testDirPath);
      jest.mocked(fs.unlink).mockResolvedValue(undefined);
      jest.mocked(fs.readdir).mockResolvedValue(mockEmptyList);
      jest.mocked(fs.rmdir).mockResolvedValue(undefined);

      await fsService.deleteFileAndParentDir(testFilePath);

      expect(fs.unlink).toHaveBeenCalledWith(testFilePath);
      expect(path.dirname).toHaveBeenCalledWith(testFilePath);
      expect(fs.readdir).toHaveBeenCalledWith(testDirPath);
      expect(fs.rmdir).toHaveBeenCalledWith(testDirPath);
    });

    it('should delete file but not parent directory if not empty', async () => {
      jest.mocked(path.dirname).mockReturnValue(testDirPath);
      jest.mocked(fs.unlink).mockResolvedValue(undefined);
      jest.mocked(fs.readdir).mockResolvedValue(mockFilesList);

      await fsService.deleteFileAndParentDir(testFilePath);

      expect(fs.unlink).toHaveBeenCalledWith(testFilePath);
      expect(path.dirname).toHaveBeenCalledWith(testFilePath);
      expect(fs.readdir).toHaveBeenCalledWith(testDirPath);
      expect(fs.rmdir).not.toHaveBeenCalled();
    });

    it('should throw FSError when file deletion fails', async () => {
      const deleteError = new Error('File not found');
      jest.mocked(fs.unlink).mockRejectedValue(deleteError);

      await expect(fsService.deleteFileAndParentDir(testFilePath)).rejects.toThrow(FSError);

      expect(fs.readdir).not.toHaveBeenCalled();
      expect(fs.rmdir).not.toHaveBeenCalled();
    });

    it('should wrap non-FSError in FSError when an error occurs', async () => {
      const regularError = new Error('Some unexpected error');
      jest.spyOn(fsService, 'deleteFile').mockRejectedValue(regularError);

      const result = fsService.deleteFileAndParentDir(testFilePath);

      await expect(result).rejects.toThrow(FSError);
      await expect(result).rejects.toThrow(`Failed to delete file and parent directory for ${testFilePath}`);

      expect(fs.readdir).not.toHaveBeenCalled();
      expect(fs.rmdir).not.toHaveBeenCalled();
    });

    it('should throw FSError when directory operation fails', async () => {
      jest.mocked(path.dirname).mockReturnValue(testDirPath);
      jest.mocked(fs.unlink).mockResolvedValue(undefined);

      const dirError = new Error('Directory not found');
      jest.mocked(fs.readdir).mockRejectedValue(dirError);

      await expect(fsService.deleteFileAndParentDir(testFilePath)).rejects.toThrow(FSError);

      expect(fs.unlink).toHaveBeenCalledWith(testFilePath);
      expect(fs.rmdir).not.toHaveBeenCalled();
    });
  });

  describe('getFileSize', () => {
    it('should return the file size correctly', async () => {
      const testFileSize = 1024;
      const statsMock = {
        size: testFileSize,
        isFile: jest.fn().mockReturnValue(true),
        isDirectory: jest.fn().mockReturnValue(false),
      } as unknown as Stats;

      jest.mocked(fs.stat).mockResolvedValue(statsMock);

      const result = await fsService.getFileSize(testFilePath);

      expect(result).toBe(testFileSize);
      expect(fs.stat).toHaveBeenCalledWith(testFilePath);
    });

    it('should throw FSError when stat operation fails', async () => {
      const statError = new Error('File not found');
      jest.mocked(fs.stat).mockRejectedValue(statError);

      await expect(fsService.getFileSize(testFilePath)).rejects.toThrow(FSError);
      expect(fs.stat).toHaveBeenCalledWith(testFilePath);
    });

    it('should handle very large file sizes', async () => {
      const largeFileSize = Number.MAX_SAFE_INTEGER; // 9,007,199,254,740,991
      const statsMock = {
        size: largeFileSize,
        isFile: jest.fn().mockReturnValue(true),
        isDirectory: jest.fn().mockReturnValue(false),
      } as unknown as Stats;

      jest.mocked(fs.stat).mockResolvedValue(statsMock);

      const result = await fsService.getFileSize(testFilePath);

      expect(result).toBe(largeFileSize);
      expect(fs.stat).toHaveBeenCalledWith(testFilePath);
    });
  });
});
