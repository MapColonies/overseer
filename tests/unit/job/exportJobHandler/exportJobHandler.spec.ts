/* eslint-disable @typescript-eslint/unbound-method */
import path from 'path';
import { OperationStatus } from '@map-colonies/mc-priority-queue';
import { faker } from '@faker-js/faker';
import { ExportFinalizeType } from '@map-colonies/raster-shared';
import { ogr2ogr } from 'ogr2ogr';
import { GPKG_CONTENT_TYPE, JSON_CONTENT_TYPE } from '../../../../src/common/constants';
import { ExportTask } from '../../../../src/common/interfaces';
import { LayerNotFoundError } from '../../../../src/common/errors';
import { clear, registerDefaultConfig, setValue } from '../../mocks/configMock';
import { createFakeAggregatedPartData } from '../../httpClients/catalogClientSetup';
import { finalizeSuccessTaskForExport, initTaskForExport } from '../../mocks/tasksMockData';
import { exportJob } from '../../mocks/jobsMockData';
import { layerRecord } from '../../mocks/catalogClientMockData';
import { ExportFinalizeTask, ExportJob } from '../../../../src/utils/zod/schemas/job.schema';
import { exportTaskSources, exportTileRangeBatches } from '../../mocks/exportTaskMockData';
import { setupExportJobHandlerTest } from './exportJobHandlerSetup';

// Mock ogr2ogr
jest.mock('ogr2ogr', () => ({
  ogr2ogr: jest.fn().mockResolvedValue(undefined),
}));

describe('ExportJobHandler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    clear();
    registerDefaultConfig();
  });

  describe('handleJobInit', () => {
    it('should handle job init successfully', async () => {
      const { exportJobHandler, exportTaskManagerMock, queueClientMock, jobManagerClientMock, catalogClientMock, configMock } =
        setupExportJobHandlerTest();
      const exportTaskType = configMock.get<string>('jobManagement.export.tasks.tilesExporting.type');
      const job = exportJob;
      const task = initTaskForExport;
      const tilesExportingTask: ExportTask = {
        type: exportTaskType,
        parameters: {
          batches: exportTileRangeBatches,
          sources: exportTaskSources,
          isNewTarget: true,
          outputFormatStrategy: exportJob.parameters.additionalParams.outputFormatStrategy,
          targetFormat: exportJob.parameters.additionalParams.targetFormat,
        },
      };

      catalogClientMock.findLayer.mockResolvedValue(layerRecord);
      exportTaskManagerMock.generateTileRangeBatches.mockReturnValue(exportTileRangeBatches);
      exportTaskManagerMock.generateSources.mockReturnValue(exportTaskSources);
      jobManagerClientMock.createTaskForJob.mockResolvedValue(undefined);
      queueClientMock.ack.mockResolvedValue(undefined);

      await exportJobHandler.handleJobInit(job, task);

      expect(catalogClientMock.findLayer).toHaveBeenCalledWith(job.internalId);
      expect(exportTaskManagerMock.generateTileRangeBatches).toHaveBeenCalledWith(job.parameters.exportInputParams.roi, layerRecord.metadata);
      expect(exportTaskManagerMock.generateSources).toHaveBeenCalledWith(job, layerRecord.metadata);
      expect(jobManagerClientMock.createTaskForJob).toHaveBeenCalledWith(job.id, tilesExportingTask);
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
    });

    it('should handle job init failure when catalog client fails', async () => {
      const { exportJobHandler, queueClientMock, catalogClientMock } = setupExportJobHandlerTest();
      const job = exportJob;
      const task = initTaskForExport;
      const error = new LayerNotFoundError('Layer not found');

      catalogClientMock.findLayer.mockRejectedValue(error);
      queueClientMock.reject.mockResolvedValue(undefined);

      await exportJobHandler.handleJobInit(job, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, error.message);
    });

    it('should handle job init failure when generating tile ranges fails', async () => {
      const { exportJobHandler, exportTaskManagerMock, queueClientMock, catalogClientMock } = setupExportJobHandlerTest();
      const job = exportJob;
      const task = initTaskForExport;
      const error = new Error('Failed to generate tile ranges');

      catalogClientMock.findLayer.mockResolvedValue(layerRecord);
      exportTaskManagerMock.generateTileRangeBatches.mockImplementation(() => {
        throw error;
      });
      queueClientMock.reject.mockResolvedValue(undefined);

      await exportJobHandler.handleJobInit(job, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, error.message);
    });

    it('should handle job init failure when generating sources fails', async () => {
      const { exportJobHandler, exportTaskManagerMock, queueClientMock, catalogClientMock } = setupExportJobHandlerTest();
      const job = exportJob;
      const task = initTaskForExport;
      const error = new Error('Failed to generate sources');

      catalogClientMock.findLayer.mockResolvedValue(layerRecord);
      exportTaskManagerMock.generateTileRangeBatches.mockReturnValue([]);
      exportTaskManagerMock.generateSources.mockImplementation(() => {
        throw error;
      });
      queueClientMock.reject.mockResolvedValue(undefined);

      await exportJobHandler.handleJobInit(job, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, error.message);
    });
  });

  describe('handleJobFinalize', () => {
    const gpkgsPath = '/gpkgs';
    const gpkgRelativePath = 'package.gpkg';
    const gpkgFilePath = `${gpkgsPath}/${gpkgRelativePath}`;
    const jsonFilePath = gpkgFilePath.replace('.gpkg', '.json');
    const gpkgDirPath = '/path/to/gpkgs';
    let joinSpy: jest.SpyInstance;
    let dirnameSpy: jest.SpyInstance;
    beforeEach(() => {
      joinSpy = jest.spyOn(path, 'join').mockReturnValue(gpkgFilePath);
      dirnameSpy = jest.spyOn(path, 'dirname').mockReturnValue(gpkgDirPath);
    });

    describe('when handling GPKG file modification', () => {
      it('should modify GPKG metadata and update file size', async () => {
        const { exportJobHandler, fsServiceMock, jobManagerClientMock, polygonPartsManagerClientMock, catalogClientMock } =
          setupExportJobHandlerTest();

        const job = {
          ...exportJob,
          parameters: {
            ...exportJob.parameters,
            additionalParams: {
              ...exportJob.parameters.additionalParams,
              packageRelativePath: gpkgRelativePath,
            },
          },
        };
        const task = {
          ...finalizeSuccessTaskForExport,
          parameters: {
            ...finalizeSuccessTaskForExport.parameters,
            gpkgModified: false,
          },
        };

        const aggregatedLayerMetadata = createFakeAggregatedPartData();
        const fileSize = 1024;
        const jsonFileSize = 512;
        const jsonSha256 = 'test-sha256';

        jobManagerClientMock.getJob.mockResolvedValue(job);
        polygonPartsManagerClientMock.getAggregatedLayerMetadata.mockResolvedValue(aggregatedLayerMetadata);
        catalogClientMock.findLayer.mockResolvedValue(layerRecord);
        fsServiceMock.uploadJsonFile.mockResolvedValue(undefined);
        fsServiceMock.getFileSize.mockImplementation(async (path) => {
          return Promise.resolve(path === gpkgFilePath ? fileSize : jsonFileSize);
        });
        fsServiceMock.calculateFileSha256.mockResolvedValue(jsonSha256);
        jobManagerClientMock.updateJob.mockResolvedValue(undefined);

        await exportJobHandler.handleJobFinalize(job, task);

        // Verify path methods were called correctly
        expect(joinSpy).toHaveBeenCalledWith(gpkgsPath, gpkgRelativePath);
        expect(dirnameSpy).toHaveBeenCalledWith(gpkgFilePath);

        // Verify metadata processing
        expect(polygonPartsManagerClientMock.getAggregatedLayerMetadata).toHaveBeenCalled();
        expect(catalogClientMock.findLayer).toHaveBeenCalled();
        expect(fsServiceMock.uploadJsonFile).toHaveBeenCalledWith(jsonFilePath, expect.any(Object));

        // Verify ogr2ogr called to modify GPKG
        expect(ogr2ogr).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            format: 'GPKG',
            destination: gpkgFilePath,
          })
        );

        expect(fsServiceMock.getFileSize).toHaveBeenCalledWith(gpkgFilePath);
        expect(fsServiceMock.getFileSize).toHaveBeenCalledWith(jsonFilePath);

        // Check job updated with file size and json metadata
        expect(jobManagerClientMock.updateJob).toHaveBeenCalledWith(job.id, {
          parameters: {
            ...job.parameters,
            callbackParams: {
              ...job.parameters.callbackParams,
              fileSize,
              jsonFileData: { sha256: jsonSha256, size: jsonFileSize },
              status: OperationStatus.IN_PROGRESS,
            },
          },
        });

        // Check gpkgModified flag set to true
        expect(jobManagerClientMock.updateTask).toHaveBeenCalledWith(job.id, task.id, {
          parameters: {
            ...task.parameters,
            gpkgModified: true,
          },
        });
      });

      it('should not proceed with S3 upload if GPKG modification fails', async () => {
        const { exportJobHandler, s3ServiceMock, polygonPartsManagerClientMock, catalogClientMock, jobManagerClientMock } =
          setupExportJobHandlerTest();
        const job = exportJob;
        const task = finalizeSuccessTaskForExport;

        polygonPartsManagerClientMock.getAggregatedLayerMetadata.mockResolvedValue(createFakeAggregatedPartData());
        catalogClientMock.findLayer.mockResolvedValue(layerRecord);

        (ogr2ogr as unknown as jest.Mock).mockRejectedValue(new Error('GPKG modification failed'));
        jobManagerClientMock.getJob.mockResolvedValue(job);

        await exportJobHandler.handleJobFinalize(job, task);

        // Verify S3 upload not called
        expect(s3ServiceMock.uploadFiles).not.toHaveBeenCalled();
      });
    });

    describe('when handling S3 upload', () => {
      it('should upload GPKG to S3 and delete local file when storage provider is S3', async () => {
        setValue('gpkgStorageProvider', 'S3');
        setValue('jobManagement.jobs.export.gpkgsPath', '/gpkgs');
        const { exportJobHandler, s3ServiceMock, fsServiceMock, jobManagerClientMock } = setupExportJobHandlerTest();

        const job = {
          ...exportJob,
          parameters: {
            ...exportJob.parameters,
            additionalParams: {
              ...exportJob.parameters.additionalParams,
              packageRelativePath: gpkgRelativePath,
            },
          },
        };
        const task = {
          ...finalizeSuccessTaskForExport,
          parameters: {
            ...finalizeSuccessTaskForExport.parameters,
            gpkgModified: true,
            gpkgUploadedToS3: false,
          },
        };

        s3ServiceMock.uploadFiles.mockResolvedValue([]);
        fsServiceMock.deleteFileAndParentDir.mockResolvedValue(undefined);
        jobManagerClientMock.updateJob.mockResolvedValue(undefined);
        jobManagerClientMock.getJob.mockResolvedValue(job);

        await exportJobHandler.handleJobFinalize(job, task);

        expect(joinSpy).toHaveBeenCalledWith(gpkgsPath, gpkgRelativePath);

        expect(s3ServiceMock.uploadFiles).toHaveBeenCalledWith([
          {
            filePath: gpkgFilePath,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            s3Key: expect.stringContaining(gpkgRelativePath),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            contentType: GPKG_CONTENT_TYPE,
          },
          {
            filePath: jsonFilePath,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            s3Key: expect.stringContaining(gpkgRelativePath.replace('.gpkg', '.json')),
            contentType: JSON_CONTENT_TYPE,
          },
        ]);

        expect(jobManagerClientMock.updateTask).toHaveBeenCalledWith(job.id, task.id, {
          parameters: {
            ...task.parameters,
            gpkgUploadedToS3: true,
          },
        });
      });

      it('should skip S3 upload when storage provider is not S3', async () => {
        setValue('gpkgStorageProvider', 'FS');
        const { exportJobHandler, s3ServiceMock, jobManagerClientMock } = setupExportJobHandlerTest();

        const job = exportJob;
        const task = {
          ...finalizeSuccessTaskForExport,
          parameters: {
            ...finalizeSuccessTaskForExport.parameters,
            gpkgModified: true,
          },
        };

        jobManagerClientMock.getJob.mockResolvedValue(job);

        await exportJobHandler.handleJobFinalize(job, task);

        // Verify S3 upload not called
        expect(s3ServiceMock.uploadFiles).not.toHaveBeenCalled();
      });

      it('should skip S3 upload if GPKG was not modified', async () => {
        setValue('gpkgStorageProvider', 'S3');
        const { exportJobHandler, s3ServiceMock, jobManagerClientMock } = setupExportJobHandlerTest();

        const job = exportJob;
        const task = {
          ...finalizeSuccessTaskForExport,
          parameters: {
            ...finalizeSuccessTaskForExport.parameters,
            gpkgModified: false,
          },
        };

        jobManagerClientMock.getJob.mockResolvedValue(job);

        await exportJobHandler.handleJobFinalize(job, task);

        // Verify S3 upload not called
        expect(s3ServiceMock.uploadFiles).not.toHaveBeenCalled();
      });
    });

    describe('when sending callbacks', () => {
      test.each(['FS', 'S3'])('should send callbacks with success status when process completes- %s storage', async (gpkgStorageProvider) => {
        setValue('gpkgStorageProvider', gpkgStorageProvider);
        const { exportJobHandler, jobManagerClientMock, callbackClientMock } = setupExportJobHandlerTest();
        const callbackUrl = 'http://callback-url.com';
        const job: ExportJob = {
          ...exportJob,
          parameters: {
            ...exportJob.parameters,
            exportInputParams: {
              ...exportJob.parameters.exportInputParams,
              callbackUrls: [{ url: callbackUrl }],
            },
            callbackParams: {
              status: OperationStatus.IN_PROGRESS,
              recordCatalogId: exportJob.internalId!,
              jobId: exportJob.id,
              roi: exportJob.parameters.exportInputParams.roi,
              fileSize: faker.number.int({ min: 0 }),
              jsonFileData: {
                sha256: 'test-sha256',
                size: faker.number.int({ min: 0 }),
              },
            },
          },
        };

        const task = {
          ...finalizeSuccessTaskForExport,
          parameters: {
            ...finalizeSuccessTaskForExport.parameters,
            gpkgModified: true,
            gpkgUploadedToS3: true,
            callbacksSent: false,
          },
        };

        jobManagerClientMock.updateJob.mockResolvedValue(undefined);
        jobManagerClientMock.getJob.mockResolvedValue({ ...job, status: OperationStatus.COMPLETED });
        callbackClientMock.send.mockResolvedValue(undefined);

        await exportJobHandler.handleJobFinalize(job, task);

        // Check callback contains new metadata artifact and links
        expect(callbackClientMock.send).toHaveBeenCalledWith(
          callbackUrl,
          expect.objectContaining({
            status: OperationStatus.COMPLETED,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            artifacts: expect.arrayContaining([
              expect.objectContaining({
                type: 'GPKG',
                sha256: 'test-sha256',
              }),
              expect.objectContaining({
                type: 'METADATA',
              }),
            ]),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            links: expect.objectContaining({
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              dataURI: expect.any(String),
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              metadataURI: expect.any(String),
            }),
          })
        );

        expect(jobManagerClientMock.updateTask).toHaveBeenCalledWith(job.id, task.id, {
          parameters: {
            ...task.parameters,
            callbacksSent: true,
          },
        });
      });

      it('should skip callbacks when no callback URLs provided', async () => {
        const { exportJobHandler, callbackClientMock, jobManagerClientMock } = setupExportJobHandlerTest();
        const job: ExportJob = {
          ...exportJob,
          parameters: {
            ...exportJob.parameters,
            exportInputParams: {
              ...exportJob.parameters.exportInputParams,
              callbackUrls: [],
            },
            callbackParams: {
              status: OperationStatus.IN_PROGRESS,
              recordCatalogId: exportJob.internalId!,
              jobId: exportJob.id,
              roi: exportJob.parameters.exportInputParams.roi,
              fileSize: faker.number.int({ min: 0 }),
            },
          },
        };
        const task = {
          ...finalizeSuccessTaskForExport,
          parameters: {
            ...finalizeSuccessTaskForExport.parameters,
            gpkgModified: true,
            gpkgUploadedToS3: true,
          },
        };

        jobManagerClientMock.getJob.mockResolvedValue({ ...job, status: OperationStatus.COMPLETED });

        await exportJobHandler.handleJobFinalize(job, task);

        expect(callbackClientMock.send).not.toHaveBeenCalled();
      });

      it(`should skip full processing and send callbacks when finalize type is ${ExportFinalizeType.Error_Callback}`, async () => {
        const { exportJobHandler, callbackClientMock, jobManagerClientMock } = setupExportJobHandlerTest();
        const job: ExportJob = {
          ...exportJob,
          parameters: {
            ...exportJob.parameters,
            exportInputParams: {
              ...exportJob.parameters.exportInputParams,
              callbackUrls: [{ url: 'http://callback-url.com' }],
            },
            callbackParams: {
              status: OperationStatus.IN_PROGRESS,
              recordCatalogId: exportJob.internalId!,
              jobId: exportJob.id,
              roi: exportJob.parameters.exportInputParams.roi,
              fileSize: faker.number.int({ min: 0 }),
            },
          },
        };
        const task: ExportFinalizeTask = {
          ...finalizeSuccessTaskForExport,
          parameters: {
            type: ExportFinalizeType.Error_Callback,
            callbacksSent: false,
          },
        };

        jobManagerClientMock.getJob.mockResolvedValue({ ...job, status: OperationStatus.FAILED });

        await exportJobHandler.handleJobFinalize(job, task);

        expect(callbackClientMock.send).toHaveBeenCalled();
      });
    });

    describe('when completing the task', () => {
      it('should complete the task when all steps are done', async () => {
        const { exportJobHandler, queueClientMock, jobManagerClientMock } = setupExportJobHandlerTest();
        const job = exportJob;
        const task = {
          ...finalizeSuccessTaskForExport,
          parameters: {
            ...finalizeSuccessTaskForExport.parameters,
            gpkgModified: true,
            gpkgUploadedToS3: true,
            callbacksSent: true,
          },
        };

        jobManagerClientMock.updateJob.mockResolvedValue(undefined);
        queueClientMock.ack.mockResolvedValue(undefined);
        jobManagerClientMock.getJob.mockResolvedValue({ ...job, status: OperationStatus.COMPLETED });

        const completeTaskSpy = jest.spyOn(exportJobHandler as unknown as { completeTask: jest.Func }, 'completeTask');

        await exportJobHandler.handleJobFinalize(job, task);

        expect(completeTaskSpy).toHaveBeenCalledWith(job, task, expect.any(Object));
      });
    });

    describe('when handling errors', () => {
      it('should handle and report errors during GPKG modification', async () => {
        const { exportJobHandler, polygonPartsManagerClientMock, queueClientMock, jobManagerClientMock } = setupExportJobHandlerTest();
        const job = exportJob;
        const task = finalizeSuccessTaskForExport;
        const error = new Error('GPKG modification failed');

        polygonPartsManagerClientMock.getAggregatedLayerMetadata.mockRejectedValue(error);
        jobManagerClientMock.getJob.mockResolvedValue(job);
        queueClientMock.reject.mockResolvedValue(undefined);

        await exportJobHandler.handleJobFinalize(job, task);

        expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, error.message);
      });

      it('should handle and report errors during S3 upload', async () => {
        setValue('gpkgStorageProvider', 'S3');

        const { exportJobHandler, s3ServiceMock, queueClientMock, jobManagerClientMock } = setupExportJobHandlerTest();

        const job = exportJob;
        const task = {
          ...finalizeSuccessTaskForExport,
          parameters: {
            ...finalizeSuccessTaskForExport.parameters,
            gpkgModified: true,
          },
        };
        const error = new Error('S3 upload failed');

        s3ServiceMock.uploadFiles.mockRejectedValue(error);
        queueClientMock.reject.mockResolvedValue(undefined);
        jobManagerClientMock.getJob.mockResolvedValue(job);

        await exportJobHandler.handleJobFinalize(job, task);

        expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, expect.stringContaining(error.message));
      });

      it('should handle and report errors during callback sending', async () => {
        const { exportJobHandler, callbackClientMock, queueClientMock, jobManagerClientMock } = setupExportJobHandlerTest();
        const job: ExportJob = {
          ...exportJob,
          parameters: {
            ...exportJob.parameters,
            exportInputParams: {
              ...exportJob.parameters.exportInputParams,
              callbackUrls: [{ url: 'http://callback-url.com' }],
            },
            callbackParams: {
              status: OperationStatus.IN_PROGRESS,
              recordCatalogId: exportJob.internalId!,
              jobId: exportJob.id,
              roi: exportJob.parameters.exportInputParams.roi,
              fileSize: faker.number.int({ min: 0 }),
            },
          },
        };
        const task = {
          ...finalizeSuccessTaskForExport,
          parameters: {
            ...finalizeSuccessTaskForExport.parameters,
            gpkgModified: true,
            gpkgUploadedToS3: true,
          },
        };
        const error = new Error('Callback sending failed');

        callbackClientMock.send.mockRejectedValue(error);
        queueClientMock.reject.mockResolvedValue(undefined);
        jobManagerClientMock.getJob.mockResolvedValue({ ...job, status: OperationStatus.COMPLETED });

        await exportJobHandler.handleJobFinalize(job, task);

        // Callback errors should be caught but not fail the job
        expect(queueClientMock.reject).not.toHaveBeenCalled();
      });
    });
  });
});
