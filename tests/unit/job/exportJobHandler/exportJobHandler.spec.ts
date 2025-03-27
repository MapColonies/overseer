/* eslint-disable @typescript-eslint/unbound-method */
import path from 'path';
import { OperationStatus } from '@map-colonies/mc-priority-queue';
import { faker } from '@faker-js/faker';
import { EXPORT_FAILURE_MESSAGE } from '../../../../src/common/constants';
import { ExportTask } from '../../../../src/common/interfaces';
import { LayerNotFoundError } from '../../../../src/common/errors';
import { clear, registerDefaultConfig, setValue } from '../../mocks/configMock';
import { finalizeFailureTaskForExport, finalizeSuccessTaskForExport, initTaskForExport } from '../../mocks/tasksMockData';
import { exportJob } from '../../mocks/jobsMockData';
import { layerRecord } from '../../mocks/catalogClientMockData';
import { ExportJob } from '../../../../src/utils/zod/schemas/job.schema';
import { exportTaskSources, exportTileRangeBatches } from '../../mocks/exportTaskMockData';
import { setupExportJobHandlerTest } from './exportJobHandlerSetup';

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
    const gpkgDirPath = '/path/to/gpkgs';
    let joinSpy: jest.SpyInstance;
    let dirnameSpy: jest.SpyInstance;
    beforeEach(() => {
      joinSpy = jest.spyOn(path, 'join').mockReturnValue(gpkgFilePath);
      dirnameSpy = jest.spyOn(path, 'dirname').mockReturnValue(gpkgDirPath);
    });
    describe('when handling failed finalization', () => {
      it('should send callbacks when task fails and notify jobTracker', async () => {
        const { exportJobHandler, jobManagerClientMock, queueClientMock, callbackClientMock, jobTrackerClientMock } = setupExportJobHandlerTest();
        const callbackUrl = 'http://callback-url.com';

        const job: ExportJob = {
          ...exportJob,
          parameters: {
            ...exportJob.parameters,
            additionalParams: {
              ...exportJob.parameters.additionalParams,
              packageRelativePath: gpkgRelativePath,
            },
            exportInputParams: {
              ...exportJob.parameters.exportInputParams,
              callbackUrls: [{ url: callbackUrl }],
            },
          },
        };
        const task = finalizeFailureTaskForExport;

        jobManagerClientMock.updateJob.mockResolvedValue(undefined);
        callbackClientMock.send.mockResolvedValue(undefined);
        queueClientMock.ack.mockResolvedValue(undefined);

        await exportJobHandler.handleJobFinalize(job, task);

        // Verify path methods were called correctly
        expect(joinSpy).toHaveBeenCalledWith(gpkgsPath, gpkgRelativePath);
        expect(dirnameSpy).toHaveBeenCalledWith(gpkgFilePath);

        // Check callback params were updated
        expect(jobManagerClientMock.updateJob).toHaveBeenCalledWith(job.id, {
          parameters: {
            ...job.parameters,
            callbackParams: {
              ...job.parameters.callbackParams,
              status: OperationStatus.FAILED,
              errorReason: EXPORT_FAILURE_MESSAGE,
            },
          },
        });

        // Check callback was sent
        expect(callbackClientMock.send).toHaveBeenCalledWith(
          callbackUrl,
          expect.objectContaining({
            status: OperationStatus.FAILED,
            errorReason: EXPORT_FAILURE_MESSAGE,
          })
        );

        // Check task was acknowledged
        expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
        expect(jobTrackerClientMock.notify).toHaveBeenCalledWith(task);
      });
    });

    describe('when handling GPKG file modification', () => {
      it('should modify GPKG metadata and update file size', async () => {
        const { exportJobHandler, gpkgServiceMock, fsServiceMock, jobManagerClientMock } = setupExportJobHandlerTest();

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
        const fileSize = 1024;

        gpkgServiceMock.createTableFromMetadata.mockReturnValue(true);
        fsServiceMock.getFileSize.mockResolvedValue(fileSize);
        jobManagerClientMock.updateJob.mockResolvedValue(undefined);

        await exportJobHandler.handleJobFinalize(job, task);

        // Verify path methods were called correctly
        expect(joinSpy).toHaveBeenCalledWith(gpkgsPath, gpkgRelativePath);
        expect(dirnameSpy).toHaveBeenCalledWith(gpkgFilePath);

        // Verify GPKG modified
        expect(gpkgServiceMock.createTableFromMetadata).toHaveBeenCalledWith(gpkgFilePath, expect.any(Object));
        expect(fsServiceMock.getFileSize).toHaveBeenCalledWith(gpkgFilePath);

        // Check job updated with file size
        expect(jobManagerClientMock.updateJob).toHaveBeenCalledWith(job.id, {
          parameters: {
            ...job.parameters,
            callbackParams: {
              ...job.parameters.callbackParams,
              fileSize,
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
        const { exportJobHandler, gpkgServiceMock, s3ServiceMock } = setupExportJobHandlerTest();
        const job = exportJob;
        const task = finalizeSuccessTaskForExport;

        gpkgServiceMock.createTableFromMetadata.mockReturnValue(false);

        await exportJobHandler.handleJobFinalize(job, task);

        // Verify S3 upload not called
        expect(s3ServiceMock.uploadFile).not.toHaveBeenCalled();
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

        s3ServiceMock.uploadFile.mockResolvedValue('');
        fsServiceMock.deleteFileAndParentDir.mockResolvedValue(undefined);
        jobManagerClientMock.updateJob.mockResolvedValue(undefined);

        await exportJobHandler.handleJobFinalize(job, task);

        // Verify path methods were called correctly
        expect(joinSpy).toHaveBeenCalledWith(gpkgsPath, gpkgRelativePath);

        // Verify S3 upload
        expect(s3ServiceMock.uploadFile).toHaveBeenCalledWith(gpkgFilePath, expect.stringContaining(gpkgRelativePath), expect.any(String));

        // Check local file deleted after upload
        expect(fsServiceMock.deleteFileAndParentDir).toHaveBeenCalledWith(gpkgFilePath);

        // Check gpkgUploadedToS3 flag set to true
        expect(jobManagerClientMock.updateTask).toHaveBeenCalledWith(job.id, task.id, {
          parameters: {
            ...task.parameters,
            gpkgUploadedToS3: true,
          },
        });
      });

      it('should skip S3 upload when storage provider is not S3', async () => {
        setValue('gpkgStorageProvider', 'FS');
        const { exportJobHandler, s3ServiceMock } = setupExportJobHandlerTest();

        const job = exportJob;
        const task = {
          ...finalizeSuccessTaskForExport,
          parameters: {
            ...finalizeSuccessTaskForExport.parameters,
            gpkgModified: true,
          },
        };

        await exportJobHandler.handleJobFinalize(job, task);

        // Verify S3 upload not called
        expect(s3ServiceMock.uploadFile).not.toHaveBeenCalled();
      });

      it('should skip S3 upload if GPKG was not modified', async () => {
        setValue('gpkgStorageProvider', 'S3');
        const { exportJobHandler, s3ServiceMock } = setupExportJobHandlerTest();

        const job = exportJob;
        const task = {
          ...finalizeSuccessTaskForExport,
          parameters: {
            ...finalizeSuccessTaskForExport.parameters,
            gpkgModified: false,
          },
        };

        await exportJobHandler.handleJobFinalize(job, task);

        // Verify S3 upload not called
        expect(s3ServiceMock.uploadFile).not.toHaveBeenCalled();
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
        callbackClientMock.send.mockResolvedValue(undefined);

        await exportJobHandler.handleJobFinalize(job, task);

        expect(callbackClientMock.send).toHaveBeenCalledWith(
          callbackUrl,
          expect.objectContaining({
            status: OperationStatus.COMPLETED,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            artifacts: expect.any(Array),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            links: expect.any(Object),
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
        const { exportJobHandler, callbackClientMock } = setupExportJobHandlerTest();
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

        await exportJobHandler.handleJobFinalize(job, task);

        expect(callbackClientMock.send).not.toHaveBeenCalled();
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

        const completeTaskSpy = jest.spyOn(exportJobHandler as unknown as { completeTask: jest.Func }, 'completeTask');

        await exportJobHandler.handleJobFinalize(job, task);

        expect(completeTaskSpy).toHaveBeenCalledWith(job, task, expect.any(Object));
      });
    });

    describe('when handling errors', () => {
      it('should handle and report errors during GPKG modification', async () => {
        const { exportJobHandler, gpkgServiceMock, queueClientMock } = setupExportJobHandlerTest();
        const job = exportJob;
        const task = finalizeSuccessTaskForExport;
        const error = new Error('GPKG modification failed');

        gpkgServiceMock.createTableFromMetadata.mockImplementation(() => {
          throw error;
        });
        queueClientMock.reject.mockResolvedValue(undefined);

        await exportJobHandler.handleJobFinalize(job, task);

        expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, error.message);
      });

      it('should handle and report errors during S3 upload', async () => {
        setValue('gpkgStorageProvider', 'S3');

        const { exportJobHandler, gpkgServiceMock, s3ServiceMock, queueClientMock } = setupExportJobHandlerTest();

        const job = exportJob;
        const task = {
          ...finalizeSuccessTaskForExport,
          parameters: {
            ...finalizeSuccessTaskForExport.parameters,
            gpkgModified: true,
          },
        };
        const error = new Error('S3 upload failed');

        gpkgServiceMock.createTableFromMetadata.mockReturnValue(true);
        s3ServiceMock.uploadFile.mockRejectedValue(error);
        queueClientMock.reject.mockResolvedValue(undefined);

        await exportJobHandler.handleJobFinalize(job, task);

        expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, expect.stringContaining(error.message));
      });

      it('should handle and report errors during callback sending', async () => {
        const { exportJobHandler, gpkgServiceMock, callbackClientMock, queueClientMock } = setupExportJobHandlerTest();
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

        gpkgServiceMock.createTableFromMetadata.mockReturnValue(true);
        callbackClientMock.send.mockRejectedValue(error);
        queueClientMock.reject.mockResolvedValue(undefined);

        await exportJobHandler.handleJobFinalize(job, task);

        // Callback errors should be caught but not fail the job
        expect(queueClientMock.reject).not.toHaveBeenCalled();
      });
    });
  });
});
