import { ZodError } from 'zod';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { OperationStatus, TaskHandler as QueueClient, IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import { IngestionUpdateFinalizeTaskParams, IngestionUpdateJobParams } from '@map-colonies/mc-model-types';
import { feature, featureCollection, intersect } from '@turf/turf';
import { Polygon } from 'geojson';
import { CatalogClient } from '../../httpClients/catalogClient';
import { Grid, IConfig, IJobHandler, MergeTilesTaskParams } from '../../common/interfaces';
import { PolygonPartMangerClient } from '../../httpClients/polygonPartMangerClient';
import { SeedJobCreationError } from '../../common/errors';
import { SeedMode, SERVICES } from '../../common/constants';
import { updateAdditionalParamsSchema } from '../../utils/zod/schemas/jobParametersSchema';
import { TileMergeTaskManager } from '../../task/models/tileMergeTaskManager';
import { JobHandler } from './jobHandler';
import { SeedingJobCreator } from './SeedingJobCreator';

@injectable()
export class UpdateJobHandler extends JobHandler implements IJobHandler {
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(TileMergeTaskManager) private readonly taskBuilder: TileMergeTaskManager,
    @inject(SERVICES.QUEUE_CLIENT) protected queueClient: QueueClient,
    @inject(CatalogClient) private readonly catalogClient: CatalogClient,
    @inject(SeedingJobCreator) private readonly seedingJobCreator: SeedingJobCreator,
    private readonly polygonPartMangerClient: PolygonPartMangerClient
  ) {
    super(logger, queueClient);
  }

  public async handleJobInit(job: IJobResponse<IngestionUpdateJobParams, unknown>, taskId: string): Promise<void> {
    const logger = this.logger.child({ jobId: job.id, taskId, jobType: job.type });
    try {
      logger.info({ msg: `handling ${job.type} job with "init" task` });
      const { inputFiles, partsData, additionalParams } = job.parameters;

      const validAdditionalParams = this.validateAdditionalParams(additionalParams, updateAdditionalParamsSchema);

      const taskBuildParams: MergeTilesTaskParams = {
        inputFiles,
        taskMetadata: {
          layerRelativePath: `${job.internalId}/${validAdditionalParams.displayPath}`,
          tileOutputFormat: validAdditionalParams.tileOutputFormat,
          isNewTarget: false,
          grid: Grid.TWO_ON_ONE,
        },
        partsData,
      };

      logger.info({ msg: 'building tasks' });
      const mergeTasks = this.taskBuilder.buildTasks(taskBuildParams);

      logger.info({ msg: 'pushing tasks' });
      await this.taskBuilder.pushTasks(job.id, mergeTasks);

      logger.info({ msg: 'Acking task' });
      await this.queueClient.ack(job.id, taskId);
    } catch (err) {
      if (err instanceof ZodError) {
        const errorMsg = `Failed to validate additionalParams: ${err.message}`;
        logger.error({ msg: errorMsg, err });
        await this.queueClient.reject(job.id, taskId, false, err.message);
        return await this.queueClient.jobManagerClient.updateJob(job.id, { status: OperationStatus.FAILED, reason: errorMsg });
      }
      if (err instanceof Error) {
        logger.error({ msg: 'Failed to handle job init', error: err });
        await this.queueClient.reject(job.id, taskId, true, err.message);
      }
    }
  }

  public async handleJobFinalize(
    job: IJobResponse<IngestionUpdateJobParams, unknown>,
    task: ITaskResponse<IngestionUpdateFinalizeTaskParams>
  ): Promise<void> {
    const logger = this.logger.child({ jobId: job.id, taskId: task.id, jobType: job.type, taskType: task.type });
    try {
      logger.info({ msg: `handling ${job.type} job with ${task.type} task` });
      let finalizeTaskParams: IngestionUpdateFinalizeTaskParams = task.parameters;
      const { updatedInCatalog } = finalizeTaskParams;

      if (!updatedInCatalog) {
        logger.info({ msg: 'Updating layer in catalog', catalogId: job.internalId });
        await this.catalogClient.update(job);
        finalizeTaskParams = await this.markFinalizeStepAsCompleted(job.id, task.id, finalizeTaskParams, 'updatedInCatalog');
      }

      if (this.isAllStepsCompleted(finalizeTaskParams)) {
        logger.info({ msg: 'All finalize steps completed successfully', ...finalizeTaskParams });
        await this.completeTaskAndJob(job, task);
        await this.setupAndCreateSeedingJob(job);
      }
    } catch (err) {
      if (err instanceof SeedJobCreationError) {
        logger.warn({ msg: err.message, error: err });
        return;
      }
      if (err instanceof Error) {
        const errorMsg = `Failed to handle job finalize: ${err.message}`;
        logger.error({ msg: errorMsg, error: err });
        await this.queueClient.reject(job.id, task.id, true, err.message);
      }
    }
  }

  private async setupAndCreateSeedingJob(job: IJobResponse<IngestionUpdateJobParams, unknown>): Promise<void> {
    const logger = this.logger.child({ ingestionJobId: job.id });

    try {
      const layerName = this.validateAndGenerateLayerNameFormats(job).mapproxy;
      logger.setBindings({ layerName });

      logger.info({ msg: 'Starting seeding job creation' });
      logger.debug({ msg: 'getting current footprint from additionalParams' });
      const { footprint: currentFootprint } = this.validateAdditionalParams(job.parameters.additionalParams, updateAdditionalParamsSchema);

      logger.debug({ msg: 'Getting new footprint from layer aggregated data' });
      const { footprint: newFootprint } = this.polygonPartMangerClient.getAggregatedPartData(job.parameters.partsData);

      const footprintsFeatureCollection = featureCollection([feature(newFootprint), feature(currentFootprint)]);
      const geometry = intersect<Polygon>(footprintsFeatureCollection)?.geometry;
      logger.debug({ msg: 'Calculated intersection geometry', geometry });

      if (!geometry) {
        throw new Error('There is no intersection between current and new footprints');
      }

      logger.info({ msg: 'Creating seeding job' });
      const jobResponse = await this.seedingJobCreator.create({ mode: SeedMode.SEED, geometry, layerName, ingestionJob: job });
      logger.info({ msg: 'Seeding job created successfully', seedJobId: jobResponse.id, seedTaskIds: jobResponse.taskIds });
    } catch (err) {
      let errorMsg = 'Failed to create seeding job, skipping seeding job creation';
      if (err instanceof Error) {
        const reason = err.message;
        errorMsg = `${errorMsg}, reason:${reason}`;
        throw new SeedJobCreationError(errorMsg, err);
      }
    }
  }
}
