/* eslint-disable @typescript-eslint/unbound-method */
import fs from 'fs/promises';
import { Dirent } from 'fs';
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
});
