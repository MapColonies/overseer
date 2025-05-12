/* eslint-disable @typescript-eslint/naming-convention */
import fs from 'fs';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import jsLogger from '@map-colonies/js-logger';
import { IS3Config } from '../../../src/common/interfaces';
import { S3Service, UploadFile } from '../../../src/utils/storage/s3Service';
import { tracerMock } from '../mocks/tracerMock';
import { GPKG_CONTENT_TYPE } from '../../../src/common/constants';
import { S3Error } from '../../../src/common/errors';

jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/lib-storage');

describe('s3Service', () => {
  const mockS3Config: IS3Config = {
    accessKeyId: 'accessKeyId',
    secretAccessKey: 'secretAccessKey',
    endpointUrl: 'http://localhost:9000',
    bucket: 'bucket',
    objectKey: 'objectKey',
    sslEnabled: false,
  };

  let s3Service: S3Service;
  let createReadStreamSpy: jest.SpyInstance;
  let uploadDoneSpy: jest.Mock;
  const testS3Key = 'test/file.gpkg';
  const mockReadStream = { fake: 'stream' };

  const testFiles: UploadFile[] = [
    { filePath: '/path/to/test/file1.gpkg', s3Key: 'test/file1.gpkg', contentType: GPKG_CONTENT_TYPE },
    { filePath: '/path/to/test/file2.gpkg', s3Key: 'test/file2.gpkg', contentType: GPKG_CONTENT_TYPE },
    { filePath: '/path/to/test/file3.gpkg', s3Key: 'test/file3.gpkg', contentType: GPKG_CONTENT_TYPE },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    createReadStreamSpy = jest.spyOn(fs, 'createReadStream').mockReturnValue(mockReadStream as unknown as fs.ReadStream);

    uploadDoneSpy = jest.fn().mockResolvedValue({
      Bucket: mockS3Config.bucket,
      Key: testS3Key,
    });

    (Upload as unknown as jest.Mock).mockImplementation(() => ({
      done: uploadDoneSpy,
    }));

    s3Service = new S3Service(jsLogger({ enabled: false }), mockS3Config, tracerMock);
  });

  describe('uploadFiles', () => {
    beforeEach(() => {
      let callCount = 0;
      // eslint-disable-next-line @typescript-eslint/promise-function-async
      uploadDoneSpy.mockImplementation(() => {
        const index = callCount++;
        return Promise.resolve({
          Bucket: mockS3Config.bucket,
          Key: testFiles[index % testFiles.length].s3Key,
        });
      });
    });

    it('should upload multiple files to S3', async () => {
      const expectedUrls = testFiles.map((file) => `${mockS3Config.endpointUrl}/${mockS3Config.bucket}/${file.s3Key}`);

      const s3ClientCtorArgs = {
        credentials: {
          accessKeyId: mockS3Config.accessKeyId,
          secretAccessKey: mockS3Config.secretAccessKey,
        },
        endpoint: mockS3Config.endpointUrl,
        region: 'us-east-1',
        forcePathStyle: true,
      };

      const urls = await s3Service.uploadFiles(testFiles);

      expect(urls).toEqual(expectedUrls);
      expect(createReadStreamSpy).toHaveBeenCalledTimes(testFiles.length);
      expect(S3Client).toHaveBeenCalledWith(s3ClientCtorArgs);
      expect(Upload).toHaveBeenCalledTimes(testFiles.length);

      testFiles.forEach((file, index) => {
        expect(createReadStreamSpy).toHaveBeenNthCalledWith(index + 1, file.filePath);

        const expectedUploadParams = {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          client: expect.any(S3Client),
          params: {
            Bucket: mockS3Config.bucket,
            Key: file.s3Key,
            ContentType: file.contentType,
            Body: mockReadStream,
          },
        };

        expect(Upload).toHaveBeenNthCalledWith(index + 1, expectedUploadParams);
      });

      expect(uploadDoneSpy).toHaveBeenCalledTimes(testFiles.length);
    });

    it('should upload single file to S3', async () => {
      const expectedUrl = `${mockS3Config.endpointUrl}/${mockS3Config.bucket}/${testFiles[0].s3Key}`;
      const s3ClientCtorArgs = {
        credentials: {
          accessKeyId: mockS3Config.accessKeyId,
          secretAccessKey: mockS3Config.secretAccessKey,
        },
        endpoint: mockS3Config.endpointUrl,
        region: 'us-east-1',
        forcePathStyle: true,
      };
      const urls = await s3Service.uploadFiles([testFiles[0]]);
      expect(urls).toEqual([expectedUrl]);
      expect(createReadStreamSpy).toHaveBeenCalledTimes(1);
      expect(S3Client).toHaveBeenCalledWith(s3ClientCtorArgs);
      expect(Upload).toHaveBeenCalledTimes(1);
      expect(createReadStreamSpy).toHaveBeenCalledWith(testFiles[0].filePath);
      const expectedUploadParams = {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        client: expect.any(S3Client),
        params: {
          Bucket: mockS3Config.bucket,
          Key: testFiles[0].s3Key,
          ContentType: testFiles[0].contentType,
          Body: mockReadStream,
        },
      };
      expect(Upload).toHaveBeenCalledWith(expectedUploadParams);
      expect(uploadDoneSpy).toHaveBeenCalledTimes(1);
    });

    it('should throw an error if one of the file uploads fails', async () => {
      const uploadError = new Error('upload failed');
      uploadDoneSpy.mockRejectedValueOnce(uploadError);

      const expectedError = new S3Error(uploadError, 'Failed to upload files to S3');

      await expect(s3Service.uploadFiles(testFiles)).rejects.toThrow(expectedError);
    });

    it('should handle file system errors during multiple upload', async () => {
      const fsError = new Error('file system error');
      createReadStreamSpy.mockImplementationOnce(() => {
        throw fsError;
      });

      const expectedError = new S3Error(fsError, 'Failed to upload files to S3');

      await expect(s3Service.uploadFiles(testFiles)).rejects.toThrow(expectedError);
    });

    it('should handle empty files array', async () => {
      const urls = await s3Service.uploadFiles([]);

      expect(urls).toEqual([]);
      expect(createReadStreamSpy).not.toHaveBeenCalled();
      expect(Upload).not.toHaveBeenCalled();
      expect(uploadDoneSpy).not.toHaveBeenCalled();
    });
  });
});
