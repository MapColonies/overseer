/* eslint-disable @typescript-eslint/unbound-method */
import { Polygon } from 'geojson';
import { ZodError } from 'zod';
import { feature, featureCollection, intersect } from '@turf/turf';
import { OperationStatus } from '@map-colonies/mc-priority-queue';
import { Grid, IMergeTaskParameters, ISeedJobParams, MapproxyLayerName, PartAggregatedData } from '../../../../src/common/interfaces';
import { finalizeTaskForIngestionUpdate } from '../../mocks/tasksMockData';
import { updateAdditionalParamsSchema } from '../../../../src/utils/zod/schemas/jobParametersSchema';
import { registerDefaultConfig } from '../../mocks/configMock';
import { COMPLETED_PERCENTAGE, SeedMode } from '../../../../src/common/constants';
import { ingestionUpdateJob } from '../../mocks/jobsMockData';
import { SeedJobCreationError } from '../../../../src/common/errors';
import { setupUpdateJobHandlerTest } from './updateJobHandlerSetup';

describe('updateJobHandler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    registerDefaultConfig();
  });

  describe('handleJobInit', () => {
    it('should handle job init successfully', async () => {
      const { updateJobHandler, queueClientMock, taskBuilderMock } = setupUpdateJobHandlerTest();
      const job = structuredClone(ingestionUpdateJob);
      const taskId = '291bf779-efe0-42bd-8357-aaede47e4d37';

      const additionalParams = updateAdditionalParamsSchema.parse(job.parameters.additionalParams);

      const taskBuildParams = {
        inputFiles: job.parameters.inputFiles,
        taskMetadata: {
          layerRelativePath: `${job.internalId}/${additionalParams.displayPath}`,
          tileOutputFormat: additionalParams.tileOutputFormat,
          isNewTarget: false,
          grid: Grid.TWO_ON_ONE,
        },
        partsData: job.parameters.partsData,
      };

      const mergeTasks: AsyncGenerator<IMergeTaskParameters, void, void> = (async function* () {})();

      taskBuilderMock.buildTasks.mockReturnValue(mergeTasks);
      taskBuilderMock.pushTasks.mockResolvedValue(undefined);
      queueClientMock.ack.mockResolvedValue(undefined);

      await updateJobHandler.handleJobInit(job, taskId);

      expect(taskBuilderMock.buildTasks).toHaveBeenCalledWith(taskBuildParams);
      expect(taskBuilderMock.pushTasks).toHaveBeenCalledWith(job.id, mergeTasks);
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, taskId);
    });

    it('should handle job init failure and reject the task', async () => {
      const { updateJobHandler, taskBuilderMock, queueClientMock } = setupUpdateJobHandlerTest();

      const job = structuredClone(ingestionUpdateJob);

      const taskId = '7e630dea-ea29-4b30-a88e-5407bf67d1bc';
      const tasks: AsyncGenerator<IMergeTaskParameters, void, void> = (async function* () {})();

      const error = new Error('Test error');

      taskBuilderMock.buildTasks.mockReturnValue(tasks);
      taskBuilderMock.pushTasks.mockRejectedValue(error);
      queueClientMock.reject.mockResolvedValue(undefined);

      await updateJobHandler.handleJobInit(job, taskId);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, taskId, true, error.message);
    });

    it('should handle job init failure with ZodError and Failed the job', async () => {
      const { updateJobHandler, jobManagerClientMock, queueClientMock } = setupUpdateJobHandlerTest();
      const job = structuredClone(ingestionUpdateJob);
      job.parameters.additionalParams = { wrongField: 'wrongValue' };
      const taskId = '291bf779-efe0-42bd-8357-aaede47e4d37';
      const validAdditionalParamsSpy = jest.spyOn(updateAdditionalParamsSchema, 'parse');

      await updateJobHandler.handleJobInit(job, taskId);

      expect(validAdditionalParamsSpy).toThrow(ZodError);
      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, taskId, false, expect.any(String));
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      expect(jobManagerClientMock.updateJob).toHaveBeenCalledWith(job.id, { status: OperationStatus.FAILED, reason: expect.any(String) });
    });
  });
  describe('handleJobFinalize', () => {
    it('should handle job finalize successfully', async () => {
      const { updateJobHandler, catalogClientMock, jobManagerClientMock, queueClientMock } = setupUpdateJobHandlerTest();
      const job = structuredClone(ingestionUpdateJob);
      const task = finalizeTaskForIngestionUpdate;

      catalogClientMock.update.mockResolvedValue(undefined);
      jobManagerClientMock.updateTask.mockResolvedValue(undefined);

      await updateJobHandler.handleJobFinalize(job, task);

      expect(catalogClientMock.update).toHaveBeenCalledWith(job);
      expect(jobManagerClientMock.updateTask).toHaveBeenCalledWith(job.id, task.id, { parameters: { updatedInCatalog: true } });
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
      expect(jobManagerClientMock.updateJob).toHaveBeenCalledWith(job.id, {
        status: OperationStatus.COMPLETED,
        percentage: COMPLETED_PERCENTAGE,
        reason: 'Job completed successfully',
      });
    });

    it('should create seeding job successfully', async () => {
      const { updateJobHandler, catalogClientMock, jobManagerClientMock, queueClientMock, seedingJobCreatorMock, polygonPartMangerClientMock } =
        setupUpdateJobHandlerTest();
      const job = structuredClone(ingestionUpdateJob);
      const task = finalizeTaskForIngestionUpdate;

      const result = updateAdditionalParamsSchema.safeParse(job.parameters.additionalParams);
      if (!result.success) {
        throw new Error('Failed to parse additionalParams');
      }
      const updatedFootprint = result.data.footprint;
      const layerName: MapproxyLayerName = `${job.resourceId}-${job.productType}`;

      const currentFootprint: Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [34.8509, 31.92505],
            [34.8509, 31.92515],
            [34.8511, 31.92515],
            [34.8511, 31.92505],
            [34.8509, 31.92505],
          ],
        ],
      };
      const footprintFeatureCollection = featureCollection([feature(updatedFootprint), feature(currentFootprint)]);
      const geometry = intersect(footprintFeatureCollection)?.geometry;
      if (geometry === undefined) {
        throw new Error('Failed to intersect footprints');
      }

      const aggregatedPartData = { footprint: currentFootprint } as PartAggregatedData;

      const createSeedingJobParams: ISeedJobParams = {
        mode: SeedMode.SEED,
        geometry: geometry,
        ingestionJob: job,
        layerName,
      };

      polygonPartMangerClientMock.getAggregatedPartData.mockReturnValue(aggregatedPartData);
      catalogClientMock.update.mockResolvedValue(undefined);
      jobManagerClientMock.updateTask.mockResolvedValue(undefined);

      await updateJobHandler.handleJobFinalize(job, task);

      expect(catalogClientMock.update).toHaveBeenCalledWith(job);
      expect(jobManagerClientMock.updateTask).toHaveBeenCalledWith(job.id, task.id, { parameters: { updatedInCatalog: true } });
      expect(queueClientMock.ack).toHaveBeenCalledWith(job.id, task.id);
      expect(jobManagerClientMock.updateJob).toHaveBeenCalledWith(job.id, {
        status: OperationStatus.COMPLETED,
        percentage: COMPLETED_PERCENTAGE,
        reason: 'Job completed successfully',
      });
      expect(seedingJobCreatorMock.create).toHaveBeenCalledWith(createSeedingJobParams);
    });

    it('should handle job finalize failure and reject the task', async () => {
      const { updateJobHandler, queueClientMock, catalogClientMock } = setupUpdateJobHandlerTest();
      const job = structuredClone(ingestionUpdateJob);
      const task = finalizeTaskForIngestionUpdate;

      const error = new Error('Test error');

      queueClientMock.reject.mockResolvedValue(undefined);

      catalogClientMock.update.mockRejectedValue(error);

      await updateJobHandler.handleJobFinalize(job, task);

      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, error.message);
    });

    it('should skip seed job creation(no intersection between current and new footprints)', async () => {
      const { updateJobHandler, catalogClientMock, jobManagerClientMock, polygonPartMangerClientMock } = setupUpdateJobHandlerTest();
      const job = structuredClone(ingestionUpdateJob);

      const aggregatedPartData = {
        footprint: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [0, 1],
              [1, 1],
              [1, 0],
              [0, 0],
            ],
          ],
        },
      } as PartAggregatedData;

      catalogClientMock.update.mockResolvedValue(undefined);
      jobManagerClientMock.updateTask.mockResolvedValue(undefined);
      polygonPartMangerClientMock.getAggregatedPartData.mockReturnValue(aggregatedPartData);

      await expect(updateJobHandler['setupAndCreateSeedingJob'](job)).rejects.toThrow(SeedJobCreationError);
    });
  });
});
