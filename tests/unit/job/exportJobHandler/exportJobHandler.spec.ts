/* eslint-disable @typescript-eslint/unbound-method */
import { ExportTask } from '../../../../src/common/interfaces';
import { LayerNotFoundError } from '../../../../src/common/errors';
import { initTaskForExport } from '../../mocks/tasksMockData';
import { exportInitJob } from '../../mocks/jobsMockData';
import { layerRecord } from '../../mocks/catalogClientMockData';
import { exportTaskSources, exportTileRangeBatches } from '../../mocks/exportTaskMockData';
import { setupExportJobHandlerTest } from './exportJobHandlerSetup';

describe('ExportJobHandler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('handleJobInit', () => {
    it('should handle job init successfully', async () => {
      const { exportJobHandler, exportTaskManagerMock, queueClientMock, jobManagerClientMock, catalogClientMock, configMock } =
        setupExportJobHandlerTest();
      const exportTaskType = configMock.get<string>('export.tasks.tilesExporting.type');
      const job = exportInitJob;
      const task = initTaskForExport;
      const tilesExportingTask: ExportTask = {
        type: exportTaskType,
        parameters: {
          batches: exportTileRangeBatches,
          sources: exportTaskSources,
          isNewTarget: true,
          outputFormatStrategy: exportInitJob.parameters.additionalParams.outputFormatStrategy,
          targetFormat: exportInitJob.parameters.additionalParams.targetFormat,
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
      const job = exportInitJob;
      const task = initTaskForExport;
      const error = new LayerNotFoundError('Layer not found');

      catalogClientMock.findLayer.mockRejectedValue(error);
      queueClientMock.reject.mockResolvedValue(undefined);

      await exportJobHandler.handleJobInit(job, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, error.message);
    });

    it('should handle job init failure when generating tile ranges fails', async () => {
      const { exportJobHandler, exportTaskManagerMock, queueClientMock, catalogClientMock } = setupExportJobHandlerTest();
      const job = exportInitJob;
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
      const job = exportInitJob;
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
    it('should throw not implemented error', async () => {
      const { exportJobHandler } = setupExportJobHandlerTest();
      const job = exportInitJob;
      const task = initTaskForExport;

      await expect(exportJobHandler.handleJobFinalize(job, task)).rejects.toThrow('Method not implemented.');
    });
  });
});
