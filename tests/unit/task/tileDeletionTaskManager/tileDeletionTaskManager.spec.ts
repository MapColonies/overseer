/* eslint-disable @typescript-eslint/unbound-method */
import { NotFoundError } from '@map-colonies/error-types';
import type { TaskBlockDuplicationParam } from '@map-colonies/raster-shared';
import type { Polygon } from 'geojson';
import { configMock, registerDefaultConfig } from '../../mocks/configMock';
import { ingestionUpdateJob } from '../../mocks/jobsMockData';
import {
  createFakeTask,
  validationTaskForIngestionUpdate,
  validationTaskWithResolutionAndSmallHolesErrorsAndReport,
  validationTaskWithResolutionErrors,
  validationTaskWithResolutionErrorsNoReportUrl,
} from '../../mocks/tasksMockData';
import type { IngestionCreateTasksTask } from '../../../../src/utils/zod/schemas/job.schema';
import { jobManagerClientMock } from '../../mocks/jobManagerMocks';
import * as reportUtils from '../../../../src/utils/report';
import { polygonPartsMangerClientMock, setupTileDeletionTaskManagerTest, type TileDeletionTaskManagerContext } from './tileDeletionTaskManagerSetup';

describe('TileDeletionTaskManager', () => {
  let testContext: TileDeletionTaskManagerContext;
  const layerRelativePath = `${ingestionUpdateJob.internalId}/${ingestionUpdateJob.parameters.additionalParams.displayPath}`;
  const polygonPartsEntityName = `${ingestionUpdateJob.resourceId}_${String(ingestionUpdateJob.productType).toLowerCase()}`;
  const task = createFakeTask<TaskBlockDuplicationParam>({ jobId: ingestionUpdateJob.id, type: 'create-tasks' }) as IngestionCreateTasksTask;

  beforeEach(async () => {
    registerDefaultConfig();
    testContext = await setupTileDeletionTaskManagerTest();
  });

  afterEach(() => {
    vi.clearAllMocks();
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

      jobManagerClientMock.findTasks.mockResolvedValue([validationTaskWithResolutionErrors]);

      const buildTasksSpy = vi.spyOn(tileDeletionTaskManager, 'buildTasks');
      const pushTasksSpy = vi.spyOn(tileDeletionTaskManager, 'pushTasks').mockResolvedValue(undefined);

      await tileDeletionTaskManager.buildAndPushTasks(ingestionUpdateJob, task, polygonPartsEntityName, layerRelativePath);

      expect(buildTasksSpy).toHaveBeenCalledWith(
        task,
        expect.objectContaining({
          polygonPartsEntityName,
          layerRelativePath,
          ingestionResolution: ingestionUpdateJob.parameters.ingestionResolution,
          tileOutputFormat: ingestionUpdateJob.parameters.additionalParams.tileOutputFormat,
          reportUrl: validationTaskWithResolutionErrors.parameters.report?.url,
        })
      );
      expect(pushTasksSpy).toHaveBeenCalledWith(ingestionUpdateJob.id, ingestionUpdateJob.type, expect.anything());
    });

    it('should propagate non-NotFoundError thrown by pushTasks', async () => {
      const { tileDeletionTaskManager } = testContext;

      jobManagerClientMock.findTasks.mockResolvedValue([validationTaskWithResolutionErrors]);
      vi.spyOn(tileDeletionTaskManager, 'buildTasks');
      vi.spyOn(tileDeletionTaskManager, 'pushTasks').mockRejectedValue(new Error('unexpected push failure'));

      await expect(tileDeletionTaskManager.buildAndPushTasks(ingestionUpdateJob, task, polygonPartsEntityName, layerRelativePath)).rejects.toThrow(
        'unexpected push failure'
      );
    });

    it('should not build deletion tasks for non-resolution conflict features (e.g. e_sm_holes) present in the report', async () => {
      const { tileDeletionTaskManager } = testContext;

      // polygon A – the resolution conflict geometry (e_res), should drive deletion task generation
      const eResGeometry: Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      };
      // polygon B – a small-holes conflict geometry (e_sm_holes), must NOT be used
      const eSmHolesGeometry: Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [10, 10],
            [11, 10],
            [11, 11],
            [10, 11],
            [10, 10],
          ],
        ],
      };

      vi.spyOn(reportUtils, 'readConflictFeatures').mockResolvedValue([
        // eslint-disable-next-line @typescript-eslint/naming-convention
        { type: 'Feature', geometry: eResGeometry, properties: { e_res: 'Resolution Conflict' } },
        // eslint-disable-next-line @typescript-eslint/naming-convention
        { type: 'Feature', geometry: eSmHolesGeometry, properties: { e_sm_holes: 'Contains small holes' } },
      ]);

      jobManagerClientMock.findTasks.mockResolvedValue([validationTaskWithResolutionAndSmallHolesErrorsAndReport]);
      // return empty intersection so no actual tile batches are generated
      polygonPartsMangerClientMock.getIntersection.mockResolvedValue({ type: 'FeatureCollection', features: [] });

      await tileDeletionTaskManager.buildAndPushTasks(ingestionUpdateJob, task, polygonPartsEntityName, layerRelativePath);

      // getIntersection must have been called with a payload containing the e_res geometry
      expect(polygonPartsMangerClientMock.getIntersection).toHaveBeenCalledWith(
        polygonPartsEntityName,
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          features: expect.arrayContaining([expect.objectContaining({ geometry: eResGeometry })]),
        })
      );

      // getIntersection must NOT have been called with a payload containing the e_sm_holes geometry
      expect(polygonPartsMangerClientMock.getIntersection).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          features: expect.arrayContaining([expect.objectContaining({ geometry: eSmHolesGeometry })]),
        })
      );

      // intersection was empty → no deletion task batches should have been enqueued
      expect(jobManagerClientMock.createTaskForJob).not.toHaveBeenCalled();
    });

    it('should NOT swallow a NotFoundError thrown by pushTasks - only pre-try NotFoundErrors are swallowed', async () => {
      const { tileDeletionTaskManager } = testContext;

      jobManagerClientMock.findTasks.mockResolvedValue([validationTaskWithResolutionErrors]);
      vi.spyOn(tileDeletionTaskManager, 'buildTasks');
      // pushTasks is inside the try block, so a NotFoundError it throws IS caught and swallowed
      vi.spyOn(tileDeletionTaskManager, 'pushTasks').mockRejectedValue(new NotFoundError('from pushTasks'));

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
      jobManagerClientMock.findTasks.mockResolvedValue([validationTaskForIngestionUpdate, validationTaskWithResolutionErrors]);
      vi.spyOn(tileDeletionTaskManager, 'pushTasks').mockResolvedValue(undefined);

      await tileDeletionTaskManager.buildAndPushTasks(ingestionUpdateJob, task, polygonPartsEntityName, layerRelativePath);

      // First task has 0 resolution errors → deletion is skipped
      expect(jobManagerClientMock.createTaskForJob).not.toHaveBeenCalled();
    });
  });
});
