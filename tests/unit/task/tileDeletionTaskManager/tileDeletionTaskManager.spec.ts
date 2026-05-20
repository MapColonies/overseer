/* eslint-disable @typescript-eslint/unbound-method */
import { NotFoundError } from '@map-colonies/error-types';
import { TaskBlockDuplicationParam } from '@map-colonies/raster-shared';
import { configMock, registerDefaultConfig } from '../../mocks/configMock';
import { ingestionUpdateJob } from '../../mocks/jobsMockData';
import {
  createFakeTask,
  validationTaskForIngestionUpdate,
  validationTaskWithResolutionErrorsAndReport,
  validationTaskWithResolutionErrorsNoReportUrl,
} from '../../mocks/tasksMockData';
import { IngestionCreateTasksTask } from '../../../../src/utils/zod/schemas/job.schema';
import { jobManagerClientMock } from '../../mocks/jobManagerMocks';
import { setupTileDeletionTaskManagerTest, type TileDeletionTaskManagerContext } from './tileDeletionTaskManagerSetup';

describe('TileDeletionTaskManager', () => {
  let testContext: TileDeletionTaskManagerContext;
  const layerRelativePath = `${ingestionUpdateJob.internalId}/${ingestionUpdateJob.parameters.additionalParams.displayPath}`;
  const polygonPartsEntityName = `${ingestionUpdateJob.resourceId}_${String(ingestionUpdateJob.productType).toLowerCase()}`;
  const task = createFakeTask<TaskBlockDuplicationParam>({ jobId: ingestionUpdateJob.id, type: 'create-tasks' }) as IngestionCreateTasksTask;

  beforeEach(() => {
    registerDefaultConfig();
    testContext = setupTileDeletionTaskManagerTest();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('buildAndPushTasks', () => {
    it('should skip deletion tasks when no resolution errors exist (resolution count = 0)', async () => {
      const { tileDeletionTaskManager } = testContext;

      jobManagerClientMock.findTasks.mockResolvedValue([validationTaskForIngestionUpdate]);

      await expect(
        tileDeletionTaskManager.buildAndPushTasks(ingestionUpdateJob, task, polygonPartsEntityName, layerRelativePath)
      ).resolves.not.toThrow();

      expect(jobManagerClientMock.createTaskForJob).not.toHaveBeenCalled();
    });

    it('should throw when no validation task is found', async () => {
      const { tileDeletionTaskManager } = testContext;

      jobManagerClientMock.findTasks.mockResolvedValue([]);

      await expect(tileDeletionTaskManager.buildAndPushTasks(ingestionUpdateJob, task, polygonPartsEntityName, layerRelativePath)).rejects.toThrow(
        'No validation tasks found'
      );

      expect(jobManagerClientMock.createTaskForJob).not.toHaveBeenCalled();
    });

    it('should skip deletion tasks when resolution errors exist but report URL is missing', async () => {
      const { tileDeletionTaskManager } = testContext;

      jobManagerClientMock.findTasks.mockResolvedValue([validationTaskWithResolutionErrorsNoReportUrl]);

      await expect(
        tileDeletionTaskManager.buildAndPushTasks(ingestionUpdateJob, task, polygonPartsEntityName, layerRelativePath)
      ).resolves.not.toThrow();

      expect(jobManagerClientMock.createTaskForJob).not.toHaveBeenCalled();
    });

    it('should throw when findTasks rejects', async () => {
      const { tileDeletionTaskManager } = testContext;

      jobManagerClientMock.findTasks.mockRejectedValue(new Error('queue is down'));

      await expect(tileDeletionTaskManager.buildAndPushTasks(ingestionUpdateJob, task, polygonPartsEntityName, layerRelativePath)).rejects.toThrow(
        'queue is down'
      );
    });

    it('should call buildTasks and pushTasks when resolution errors exist and report URL is present', async () => {
      const { tileDeletionTaskManager } = testContext;

      jobManagerClientMock.findTasks.mockResolvedValue([validationTaskWithResolutionErrorsAndReport]);

      const buildTasksSpy = jest.spyOn(tileDeletionTaskManager, 'buildTasks');
      const pushTasksSpy = jest.spyOn(tileDeletionTaskManager, 'pushTasks').mockResolvedValue(undefined);

      await tileDeletionTaskManager.buildAndPushTasks(ingestionUpdateJob, task, polygonPartsEntityName, layerRelativePath);

      expect(buildTasksSpy).toHaveBeenCalledWith(
        task,
        expect.objectContaining({
          polygonPartsEntityName,
          layerRelativePath,
          ingestionResolution: ingestionUpdateJob.parameters.ingestionResolution,
          tileOutputFormat: ingestionUpdateJob.parameters.additionalParams.tileOutputFormat,
          reportUrl: validationTaskWithResolutionErrorsAndReport.parameters.report?.url,
        })
      );
      expect(pushTasksSpy).toHaveBeenCalledWith(ingestionUpdateJob.id, ingestionUpdateJob.type, expect.anything());
    });

    it('should propagate non-NotFoundError thrown by pushTasks', async () => {
      const { tileDeletionTaskManager } = testContext;

      jobManagerClientMock.findTasks.mockResolvedValue([validationTaskWithResolutionErrorsAndReport]);
      jest.spyOn(tileDeletionTaskManager, 'buildTasks');
      jest.spyOn(tileDeletionTaskManager, 'pushTasks').mockRejectedValue(new Error('unexpected push failure'));

      await expect(tileDeletionTaskManager.buildAndPushTasks(ingestionUpdateJob, task, polygonPartsEntityName, layerRelativePath)).rejects.toThrow(
        'unexpected push failure'
      );
    });

    it('should NOT swallow a NotFoundError thrown by pushTasks - only pre-try NotFoundErrors are swallowed', async () => {
      const { tileDeletionTaskManager } = testContext;

      jobManagerClientMock.findTasks.mockResolvedValue([validationTaskWithResolutionErrorsAndReport]);
      jest.spyOn(tileDeletionTaskManager, 'buildTasks');
      // pushTasks is inside the try block, so a NotFoundError it throws IS caught and swallowed
      jest.spyOn(tileDeletionTaskManager, 'pushTasks').mockRejectedValue(new NotFoundError('from pushTasks'));

      // NotFoundError from inside the try block is swallowed
      await expect(
        tileDeletionTaskManager.buildAndPushTasks(ingestionUpdateJob, task, polygonPartsEntityName, layerRelativePath)
      ).resolves.not.toThrow();
    });
  });

  describe('fetchValidationTask (via buildAndPushTasks)', () => {
    it('should use the configured validation task type when querying findTasks', async () => {
      const { tileDeletionTaskManager } = testContext;
      const expectedTaskType = configMock.get<string>('jobManagement.ingestion.tasks.validation.type');

      // Returning a valid task so buildAndPushTasks can proceed past fetchValidationTask
      jobManagerClientMock.findTasks.mockResolvedValue([validationTaskForIngestionUpdate]);

      await tileDeletionTaskManager.buildAndPushTasks(ingestionUpdateJob, task, polygonPartsEntityName, layerRelativePath);

      expect(jobManagerClientMock.findTasks).toHaveBeenCalledWith({
        jobId: ingestionUpdateJob.id,
        type: expectedTaskType,
      });
    });

    it('should use the first validation task returned when multiple exist', async () => {
      const { tileDeletionTaskManager } = testContext;

      // First task has no resolution errors, second has — only first should be used
      jobManagerClientMock.findTasks.mockResolvedValue([validationTaskForIngestionUpdate, validationTaskWithResolutionErrorsAndReport]);
      jest.spyOn(tileDeletionTaskManager, 'pushTasks').mockResolvedValue(undefined);

      await tileDeletionTaskManager.buildAndPushTasks(ingestionUpdateJob, task, polygonPartsEntityName, layerRelativePath);

      // First task has 0 resolution errors → deletion is skipped
      expect(jobManagerClientMock.createTaskForJob).not.toHaveBeenCalled();
    });
  });
});
