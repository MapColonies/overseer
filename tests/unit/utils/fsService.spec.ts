/* eslint-disable @typescript-eslint/unbound-method */
import fsPromises from 'fs/promises';
import fs, { Dirent, ReadStream, Stats } from 'fs';
import streamPromises from 'stream/promises';
import path from 'path';
import { Readable } from 'stream';
import crypto from 'crypto';
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

    it('should write JSON data to file', async () => {
      const writeFileMock = jest.mocked(fsPromises.writeFile).mockResolvedValue(undefined);

      await fsService.uploadJsonFile(testJsonPath, testJsonData);

      expect(writeFileMock).toHaveBeenCalledWith(testJsonPath, JSON.stringify(testJsonData, null, 2));
    });

    it('should throw FSError when writing file fails', async () => {
      const writeError = new Error('Write failed');
      jest.mocked(fsPromises.writeFile).mockRejectedValue(writeError);

      await expect(fsService.uploadJsonFile(testJsonPath, testJsonData)).rejects.toThrow(FSError);
      await expect(fsService.uploadJsonFile(testJsonPath, testJsonData)).rejects.toThrow(`Failed to upload JSON file ${testJsonPath}`);
    });
  });

  describe('deleteFile', () => {
    it('should delete a file successfully', async () => {
      const unlinkMock = jest.mocked(fsPromises.unlink).mockResolvedValue(undefined);

      await fsService.deleteFile(testFilePath);

      expect(unlinkMock).toHaveBeenCalledWith(testFilePath);
    });

    it('should throw FSError when file deletion fails', async () => {
      const deleteError = new Error('File not found');
      jest.mocked(fsPromises.unlink).mockRejectedValue(deleteError);

      await expect(fsService.deleteFile(testFilePath)).rejects.toThrow(FSError);
    });
  });

  describe('deleteDirectory', () => {
    it('should delete an empty directory successfully', async () => {
      jest.mocked(fsPromises.readdir).mockResolvedValue(mockEmptyList);
      const rmdirMock = jest.mocked(fsPromises.rmdir).mockResolvedValue(undefined);

      const result = await fsService.deleteDirectory(testDirPath);

      expect(result).toBe(true);
      expect(fsPromises.readdir).toHaveBeenCalledWith(testDirPath);
      expect(rmdirMock).toHaveBeenCalledWith(testDirPath);
    });

    it('should not delete a non-empty directory without force option', async () => {
      jest.mocked(fsPromises.readdir).mockResolvedValue(mockFilesList);

      const result = await fsService.deleteDirectory(testDirPath);

      expect(result).toBe(false);
      expect(fsPromises.readdir).toHaveBeenCalledWith(testDirPath);
      expect(fsPromises.rmdir).not.toHaveBeenCalled();
      expect(fsPromises.rm).not.toHaveBeenCalled();
    });

    it('should delete a non-empty directory when force option is true', async () => {
      jest.mocked(fsPromises.readdir).mockResolvedValue(mockFilesList);
      const rmMock = jest.mocked(fsPromises.rm).mockResolvedValue(undefined);

      const result = await fsService.deleteDirectory(testDirPath, { force: true });

      expect(result).toBe(true);
      expect(fsPromises.readdir).toHaveBeenCalledWith(testDirPath);
      expect(rmMock).toHaveBeenCalledWith(testDirPath, { recursive: true, force: true });
    });

    it('should throw FSError when directory deletion fails', async () => {
      const readError = new Error('Directory not found');
      jest.mocked(fsPromises.readdir).mockRejectedValue(readError);

      await expect(fsService.deleteDirectory(testDirPath)).rejects.toThrow(FSError);
    });
  });

  describe('deleteFileAndParentDir', () => {
    it('should delete file and its parent directory if empty', async () => {
      jest.mocked(path.dirname).mockReturnValue(testDirPath);
      jest.mocked(fsPromises.unlink).mockResolvedValue(undefined);
      jest.mocked(fsPromises.readdir).mockResolvedValue(mockEmptyList);
      jest.mocked(fsPromises.rmdir).mockResolvedValue(undefined);

      await fsService.deleteFileAndParentDir(testFilePath);

      expect(fsPromises.unlink).toHaveBeenCalledWith(testFilePath);
      expect(path.dirname).toHaveBeenCalledWith(testFilePath);
      expect(fsPromises.readdir).toHaveBeenCalledWith(testDirPath);
      expect(fsPromises.rmdir).toHaveBeenCalledWith(testDirPath);
    });

    it('should delete file but not parent directory if not empty', async () => {
      jest.mocked(path.dirname).mockReturnValue(testDirPath);
      jest.mocked(fsPromises.unlink).mockResolvedValue(undefined);
      jest.mocked(fsPromises.readdir).mockResolvedValue(mockFilesList);

      await fsService.deleteFileAndParentDir(testFilePath);

      expect(fsPromises.unlink).toHaveBeenCalledWith(testFilePath);
      expect(path.dirname).toHaveBeenCalledWith(testFilePath);
      expect(fsPromises.readdir).toHaveBeenCalledWith(testDirPath);
      expect(fsPromises.rmdir).not.toHaveBeenCalled();
    });

    it('should throw FSError when file deletion fails', async () => {
      const deleteError = new Error('File not found');
      jest.mocked(fsPromises.unlink).mockRejectedValue(deleteError);

      await expect(fsService.deleteFileAndParentDir(testFilePath)).rejects.toThrow(FSError);

      expect(fsPromises.readdir).not.toHaveBeenCalled();
      expect(fsPromises.rmdir).not.toHaveBeenCalled();
    });

    it('should wrap non-FSError in FSError when an error occurs', async () => {
      const regularError = new Error('Some unexpected error');
      jest.spyOn(fsService, 'deleteFile').mockRejectedValue(regularError);

      const result = fsService.deleteFileAndParentDir(testFilePath);

      await expect(result).rejects.toThrow(FSError);
      await expect(result).rejects.toThrow(`Failed to delete file and parent directory for ${testFilePath}`);

      expect(fsPromises.readdir).not.toHaveBeenCalled();
      expect(fsPromises.rmdir).not.toHaveBeenCalled();
    });

    it('should throw FSError when directory operation fails', async () => {
      jest.mocked(path.dirname).mockReturnValue(testDirPath);
      jest.mocked(fsPromises.unlink).mockResolvedValue(undefined);

      const dirError = new Error('Directory not found');
      jest.mocked(fsPromises.readdir).mockRejectedValue(dirError);

      await expect(fsService.deleteFileAndParentDir(testFilePath)).rejects.toThrow(FSError);

      expect(fsPromises.unlink).toHaveBeenCalledWith(testFilePath);
      expect(fsPromises.rmdir).not.toHaveBeenCalled();
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

      jest.mocked(fsPromises.stat).mockResolvedValue(statsMock);

      const result = await fsService.getFileSize(testFilePath);

      expect(result).toBe(testFileSize);
      expect(fsPromises.stat).toHaveBeenCalledWith(testFilePath);
    });

    it('should throw FSError when stat operation fails', async () => {
      const statError = new Error('File not found');
      jest.mocked(fsPromises.stat).mockRejectedValue(statError);

      await expect(fsService.getFileSize(testFilePath)).rejects.toThrow(FSError);
      expect(fsPromises.stat).toHaveBeenCalledWith(testFilePath);
    });

    it('should handle very large file sizes', async () => {
      const largeFileSize = Number.MAX_SAFE_INTEGER; // 9,007,199,254,740,991
      const statsMock = {
        size: largeFileSize,
        isFile: jest.fn().mockReturnValue(true),
        isDirectory: jest.fn().mockReturnValue(false),
      } as unknown as Stats;

      jest.mocked(fsPromises.stat).mockResolvedValue(statsMock);

      const result = await fsService.getFileSize(testFilePath);

      expect(result).toBe(largeFileSize);
      expect(fsPromises.stat).toHaveBeenCalledWith(testFilePath);
    });
  });
  describe('calculateFileSha256', () => {
    const testFilePath = '/path/to/test/file.data';
    const expectedSha256 = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

    it('should calculate SHA256 hash of file correctly', async () => {
      const accessSpy = jest.spyOn(fsPromises, 'access').mockResolvedValue(undefined);

      // Mock crypto hash functions
      const mockHash = {
        update: jest.fn(),
        digest: jest.fn().mockReturnValue(expectedSha256),
      };
      const createHashSpy = jest.spyOn(crypto, 'createHash').mockReturnValue(mockHash as unknown as crypto.Hash);

      const mockStream = new Readable();
      mockStream._read = () => {}; // Required implementation

      const createReadStreamSpy = jest.spyOn(fs, 'createReadStream').mockReturnValue(mockStream as unknown as ReadStream);

      const finishedSpy = jest.spyOn(streamPromises, 'finished').mockReturnValue(Promise.resolve());

      const result = await fsService.calculateFileSha256(testFilePath);

      expect(result).toBe(expectedSha256);
      expect(accessSpy).toHaveBeenCalledWith(testFilePath);
      expect(createHashSpy).toHaveBeenCalledWith('sha256');
      expect(createReadStreamSpy).toHaveBeenCalledWith(testFilePath);
      expect(mockHash.digest).toHaveBeenCalledWith('hex');
      expect(finishedSpy).toHaveBeenCalled();
    });

    it('should throw FSError when file does not exist', async () => {
      const accessError = new Error('File not found');
      jest.mocked(fsPromises.access).mockRejectedValue(accessError);

      await expect(fsService.calculateFileSha256(testFilePath)).rejects.toThrow(FSError);
      await expect(fsService.calculateFileSha256(testFilePath)).rejects.toThrow(`Failed to calculate SHA256 for ${testFilePath}`);
    });

    it('should throw FSError when hashing process fails', async () => {
      jest.mocked(fsPromises.access).mockResolvedValue(undefined);

      const mockStream = {
        on: jest.fn().mockImplementation(() => {
          return mockStream;
        }),
      };
      jest.spyOn(fs, 'createReadStream').mockReturnValue(mockStream as never);

      const streamError = new Error('Stream processing failed');
      jest.spyOn(streamPromises, 'finished').mockRejectedValue(streamError);

      await expect(fsService.calculateFileSha256(testFilePath)).rejects.toThrow(FSError);
      expect(fsPromises.access).toHaveBeenCalledWith(testFilePath);
    });
  });
});
