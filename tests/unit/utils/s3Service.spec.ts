/* eslint-disable @typescript-eslint/naming-convention */
import fs from 'fs';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import jsLogger from '@map-colonies/js-logger';
import { IS3Config } from '../../../src/common/interfaces';
import { S3Service } from '../../../src/utils/storage/s3Service';
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
  const testFilePath = '/path/to/test/file.gpkg';
  const testS3Key = 'test/file.gpkg';
  const testContentType = GPKG_CONTENT_TYPE;
  const mockReadStream = { fake: 'stream' };

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

  describe('uploadFile', () => {
    it('should upload a file to S3', async () => {
      const expectedUrl = `${mockS3Config.endpointUrl}/${mockS3Config.bucket}/${testS3Key}`;

      const s3ClientCtorArgs = {
        credentials: {
          accessKeyId: mockS3Config.accessKeyId,
          secretAccessKey: mockS3Config.secretAccessKey,
        },
        endpoint: mockS3Config.endpointUrl,
        region: 'us-east-1',
      };

      const expectedUploadParams = {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        client: expect.any(S3Client),
        params: {
          Bucket: mockS3Config.bucket,
          Key: testS3Key,
          ContentType: testContentType,
          Body: mockReadStream,
        },
      };

      const url = await s3Service.uploadFile(testFilePath, testS3Key, testContentType);

      expect(url).toBe(expectedUrl);
      expect(createReadStreamSpy).toHaveBeenCalledWith(testFilePath);
      expect(S3Client).toHaveBeenCalledWith(s3ClientCtorArgs);
      expect(Upload).toHaveBeenCalledWith(expectedUploadParams);
      expect(uploadDoneSpy).toHaveBeenCalled();
    });

    it('should throw an error if the file upload fails', async () => {
      const uploadError = new Error('upload failed');
      uploadDoneSpy.mockRejectedValueOnce(uploadError);

      const expectedError = new S3Error(uploadError, 'Failed to upload file to S3');

      await expect(s3Service.uploadFile(testFilePath, testS3Key, testContentType)).rejects.toThrow(expectedError);
    });

    it('should handle file system errors', async () => {
      const fsError = new Error('file system error');
      createReadStreamSpy.mockImplementationOnce(() => {
        throw fsError;
      });

      const expectedError = new S3Error(fsError, 'Failed to upload file to S3');

      await expect(s3Service.uploadFile(testFilePath, testS3Key, testContentType)).rejects.toThrow(expectedError);
    });
  });
});
