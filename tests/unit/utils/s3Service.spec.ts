/* eslint-disable @typescript-eslint/naming-convention */
import fs from 'fs';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import jsLogger from '@map-colonies/js-logger';
import { IS3Config } from '../../../src/common/interfaces';
import { S3Service } from '../../../src/utils/storage/s3Service';
import { tracerMock } from '../mocks/tracerMock';
import { GPKG_CONTENT_TYPE } from '../../../src/common/constants';

jest.mock('@aws-sdk/client-s3');

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
  let S3ClientSendSpy: jest.SpyInstance;
  let readFileSyncSpy: jest.SpyInstance;
  const testFilePath = '/path/to/test/file.gpkg';
  const testS3Key = 'test/file.gpkg';
  const testContentType = GPKG_CONTENT_TYPE;
  const testFileContent = Buffer.from('test file content');

  beforeEach(() => {
    readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue(testFileContent);

    S3ClientSendSpy = jest.spyOn(S3Client.prototype, 'send');

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

      const uploadCommandParams = {
        Bucket: mockS3Config.bucket,
        Key: testS3Key,
        ContentType: testContentType,
        Body: testFileContent,
      };

      const url = await s3Service.uploadFile(testFilePath, testS3Key, testContentType);

      expect(url).toBe(expectedUrl);
      expect(readFileSyncSpy).toHaveBeenCalledWith(testFilePath);
      expect(S3Client).toHaveBeenCalledWith(s3ClientCtorArgs);
      expect(PutObjectCommand).toHaveBeenCalledWith(uploadCommandParams);
    });

    it('should throw an error if the file upload fails', async () => {
      const uploadError = new Error('upload failed');
      S3ClientSendSpy.mockRejectedValueOnce(uploadError);

      await expect(s3Service.uploadFile(testFilePath, testS3Key, testContentType)).rejects.toThrow(uploadError);
    });

    it('should handle file system errors', async () => {
      const fsError = new Error('file system error');
      readFileSyncSpy.mockImplementationOnce(() => {
        throw fsError;
      });

      await expect(s3Service.uploadFile(testFilePath, testS3Key, testContentType)).rejects.toThrow(fsError);
    });
  });
});
