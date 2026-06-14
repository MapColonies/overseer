import fsPromises from 'node:fs/promises';
import type { ReadStream, Stats } from 'node:fs';
import fsSync, { Dirent } from 'node:fs';
import streamPromises from 'node:stream/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import crypto from 'node:crypto';
import { getTestLogger } from '../../configurations/testLogger';
import { FSService } from '../../../src/utils/storage/fsService';
import { tracerMock } from '../mocks/tracerMock';
import { FSError } from '../../../src/common/errors';

vi.mock('fs/promises');
vi.mock('path');

describe('fsService', () => {
  let fsService: FSService;
  const testFilePath = '/path/to/test/file.gpkg';
  const testDirPath = '/path/to/test';
  const mockFilesList: Dirent<NonSharedBuffer>[] = [new Dirent()];
  const mockEmptyList: Dirent<NonSharedBuffer>[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    fsService = new FSService(getTestLogger(), tracerMock);
  });

  describe('uploadJsonFile', () => {
    const testJsonPath = '/path/to/test/file.json';
    const testJsonData = {
      id: 'test123',
      name: 'Test Layer',
      properties: { resolution: 0.5, type: 'orthophoto' },
    };

    it('should write JSON data to file', async () => {
      const writeFileMock = vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);

      await fsService.uploadJsonFile(testJsonPath, testJsonData);

      expect(writeFileMock).toHaveBeenCalledWith(testJsonPath, JSON.stringify(testJsonData, null, 2));
    });

    it('should throw FSError when writing file fails', async () => {
      const writeError = new Error('Write failed');
      vi.mocked(fsPromises.writeFile).mockRejectedValue(writeError);

      await expect(fsService.uploadJsonFile(testJsonPath, testJsonData)).rejects.toThrow(FSError);
      await expect(fsService.uploadJsonFile(testJsonPath, testJsonData)).rejects.toThrow(`Failed to upload JSON file ${testJsonPath}`);
    });
  });

  describe('deleteFile', () => {
    it('should delete a file successfully', async () => {
      const unlinkMock = vi.mocked(fsPromises.unlink).mockResolvedValue(undefined);

      await fsService.deleteFile(testFilePath);

      expect(unlinkMock).toHaveBeenCalledWith(testFilePath);
    });

    it('should throw FSError when file deletion fails', async () => {
      const deleteError = new Error('File not found');
      vi.mocked(fsPromises.unlink).mockRejectedValue(deleteError);

      await expect(fsService.deleteFile(testFilePath)).rejects.toThrow(FSError);
    });
  });

  describe('deleteDirectory', () => {
    it('should delete an empty directory successfully', async () => {
      vi.mocked(fsPromises.readdir).mockResolvedValue(mockEmptyList);
      const rmdirMock = vi.mocked(fsPromises.rmdir).mockResolvedValue(undefined);

      const result = await fsService.deleteDirectory(testDirPath);

      expect(result).toBe(true);
      expect(fsPromises.readdir).toHaveBeenCalledWith(testDirPath);
      expect(rmdirMock).toHaveBeenCalledWith(testDirPath);
    });

    it('should not delete a non-empty directory without force option', async () => {
      vi.mocked(fsPromises.readdir).mockResolvedValue(mockFilesList);

      const result = await fsService.deleteDirectory(testDirPath);

      expect(result).toBe(false);
      expect(fsPromises.readdir).toHaveBeenCalledWith(testDirPath);
      expect(fsPromises.rmdir).not.toHaveBeenCalled();
      expect(fsPromises.rm).not.toHaveBeenCalled();
    });

    it('should delete a non-empty directory when force option is true', async () => {
      vi.mocked(fsPromises.readdir).mockResolvedValue(mockFilesList);
      const rmMock = vi.mocked(fsPromises.rm).mockResolvedValue(undefined);

      const result = await fsService.deleteDirectory(testDirPath, { force: true });

      expect(result).toBe(true);
      expect(fsPromises.readdir).toHaveBeenCalledWith(testDirPath);
      expect(rmMock).toHaveBeenCalledWith(testDirPath, { recursive: true, force: true });
    });

    it('should throw FSError when directory deletion fails', async () => {
      const readError = new Error('Directory not found');
      vi.mocked(fsPromises.readdir).mockRejectedValue(readError);

      await expect(fsService.deleteDirectory(testDirPath)).rejects.toThrow(FSError);
    });
  });

  describe('deleteFileAndParentDir', () => {
    it('should delete file and its parent directory if empty', async () => {
      vi.mocked(path.dirname).mockReturnValue(testDirPath);
      vi.mocked(fsPromises.unlink).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readdir).mockResolvedValue(mockEmptyList);
      vi.mocked(fsPromises.rmdir).mockResolvedValue(undefined);

      await fsService.deleteFileAndParentDir(testFilePath);

      expect(fsPromises.unlink).toHaveBeenCalledWith(testFilePath);
      expect(path.dirname).toHaveBeenCalledWith(testFilePath);
      expect(fsPromises.readdir).toHaveBeenCalledWith(testDirPath);
      expect(fsPromises.rmdir).toHaveBeenCalledWith(testDirPath);
    });

    it('should delete file but not parent directory if not empty', async () => {
      vi.mocked(path.dirname).mockReturnValue(testDirPath);
      vi.mocked(fsPromises.unlink).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readdir).mockResolvedValue(mockFilesList);

      await fsService.deleteFileAndParentDir(testFilePath);

      expect(fsPromises.unlink).toHaveBeenCalledWith(testFilePath);
      expect(path.dirname).toHaveBeenCalledWith(testFilePath);
      expect(fsPromises.readdir).toHaveBeenCalledWith(testDirPath);
      expect(fsPromises.rmdir).not.toHaveBeenCalled();
    });

    it('should throw FSError when file deletion fails', async () => {
      const deleteError = new Error('File not found');
      vi.mocked(fsPromises.unlink).mockRejectedValue(deleteError);

      await expect(fsService.deleteFileAndParentDir(testFilePath)).rejects.toThrow(FSError);

      expect(fsPromises.readdir).not.toHaveBeenCalled();
      expect(fsPromises.rmdir).not.toHaveBeenCalled();
    });

    it('should wrap non-FSError in FSError when an error occurs', async () => {
      const regularError = new Error('Some unexpected error');
      vi.spyOn(fsService, 'deleteFile').mockRejectedValue(regularError);

      const result = fsService.deleteFileAndParentDir(testFilePath);

      await expect(result).rejects.toThrow(FSError);
      await expect(result).rejects.toThrow(`Failed to delete file and parent directory for ${testFilePath}`);

      expect(fsPromises.readdir).not.toHaveBeenCalled();
      expect(fsPromises.rmdir).not.toHaveBeenCalled();
    });

    it('should throw FSError when directory operation fails', async () => {
      vi.mocked(path.dirname).mockReturnValue(testDirPath);
      vi.mocked(fsPromises.unlink).mockResolvedValue(undefined);

      const dirError = new Error('Directory not found');
      vi.mocked(fsPromises.readdir).mockRejectedValue(dirError);

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
        isFile: vi.fn().mockReturnValue(true),
        isDirectory: vi.fn().mockReturnValue(false),
      } as unknown as Stats;

      vi.mocked(fsPromises.stat).mockResolvedValue(statsMock);

      const result = await fsService.getFileSize(testFilePath);

      expect(result).toBe(testFileSize);
      expect(fsPromises.stat).toHaveBeenCalledWith(testFilePath);
    });

    it('should throw FSError when stat operation fails', async () => {
      const statError = new Error('File not found');
      vi.mocked(fsPromises.stat).mockRejectedValue(statError);

      await expect(fsService.getFileSize(testFilePath)).rejects.toThrow(FSError);
      expect(fsPromises.stat).toHaveBeenCalledWith(testFilePath);
    });

    it('should handle very large file sizes', async () => {
      const largeFileSize = Number.MAX_SAFE_INTEGER; // 9,007,199,254,740,991
      const statsMock = {
        size: largeFileSize,
        isFile: vi.fn().mockReturnValue(true),
        isDirectory: vi.fn().mockReturnValue(false),
      } as unknown as Stats;

      vi.mocked(fsPromises.stat).mockResolvedValue(statsMock);

      const result = await fsService.getFileSize(testFilePath);

      expect(result).toBe(largeFileSize);
      expect(fsPromises.stat).toHaveBeenCalledWith(testFilePath);
    });
  });

  describe('calculateFileSha256', () => {
    const testFilePath = '/path/to/test/file.data';
    const expectedSha256 = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

    it('should calculate SHA256 hash of file correctly', async () => {
      const accessSpy = vi.spyOn(fsPromises, 'access').mockResolvedValue(undefined);

      // Mock crypto hash functions
      const mockHash = {
        update: vi.fn(),
        digest: vi.fn().mockReturnValue(expectedSha256),
      };
      const createHashSpy = vi.spyOn(crypto, 'createHash').mockReturnValue(mockHash as unknown as crypto.Hash);

      const mockStream = new Readable();
      mockStream._read = () => {};
      setImmediate(() => mockStream.push(null)); // Required implementation

      const createReadStreamSpy = vi.spyOn(fsSync, 'createReadStream').mockReturnValue(mockStream as unknown as ReadStream);

      const result = await fsService.calculateFileSha256(testFilePath);

      expect(result).toBe(expectedSha256);
      expect(accessSpy).toHaveBeenCalledWith(testFilePath);
      expect(createHashSpy).toHaveBeenCalledWith('sha256');
      expect(createReadStreamSpy).toHaveBeenCalledWith(testFilePath);
      expect(mockHash.digest).toHaveBeenCalledWith('hex');
    });

    it('should throw FSError when file does not exist', async () => {
      const accessError = new Error('File not found');
      vi.mocked(fsPromises.access).mockRejectedValue(accessError);

      await expect(fsService.calculateFileSha256(testFilePath)).rejects.toThrow(FSError);
      await expect(fsService.calculateFileSha256(testFilePath)).rejects.toThrow(`Failed to calculate SHA256 for ${testFilePath}`);
    });

    it('should throw FSError when hashing process fails', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);

      const mockStream = {
        on: vi.fn().mockImplementation(() => {
          return mockStream;
        }),
      };
      vi.spyOn(fsSync, 'createReadStream').mockReturnValue(mockStream as never);

      const streamError = new Error('Stream processing failed');
      vi.spyOn(streamPromises, 'finished').mockRejectedValue(streamError);

      await expect(fsService.calculateFileSha256(testFilePath)).rejects.toThrow(FSError);
      expect(fsPromises.access).toHaveBeenCalledWith(testFilePath);
    });
  });
});
