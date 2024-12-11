import { randomUUID } from 'crypto';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IJobResponse, ITaskResponse, OperationStatus, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { ZodError } from 'zod';
import { IngestionSwapUpdateFinalizeTaskParams, IngestionUpdateJobParams } from '@map-colonies/mc-model-types';
import { Grid, IJobHandler, MergeTilesTaskParams } from '../../common/interfaces';
import { MapproxyApiClient } from '../../httpClients/mapproxyClient';
import { TileMergeTaskManager } from '../../task/models/tileMergeTaskManager';
import { CatalogClient } from '../../httpClients/catalogClient';
import { TaskMetrics } from '../../utils/metrics/taskMetrics';
import { swapUpdateAdditionalParamsSchema, updateAdditionalParamsSchema } from '../../utils/zod/schemas/jobParametersSchema';
import { SeedMode, SERVICES } from '../../common/constants';
import { JobHandler } from './jobHandler';
import { SeedingJobCreator } from './seedingJobCreator';

@injectable()
export class SwapJobHandler extends JobHandler implements IJobHandler {
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.QUEUE_CLIENT) protected queueClient: QueueClient,
    @inject(TileMergeTaskManager) private readonly taskBuilder: TileMergeTaskManager,
    @inject(MapproxyApiClient) private readonly mapproxyClient: MapproxyApiClient,
    @inject(CatalogClient) private readonly catalogClient: CatalogClient,
    @inject(SeedingJobCreator) private readonly seedingJobCreator: SeedingJobCreator,
    private readonly taskMetrics: TaskMetrics
  ) {
    super(logger, queueClient);
  }

  public async handleJobInit(job: IJobResponse<IngestionUpdateJobParams, unknown>, task: ITaskResponse<unknown>): Promise<void> {
    const logger = this.logger.child({ jobId: job.id, taskId: task.id, jobType: job.type });
    const taskProcessTracking = this.taskMetrics.trackTaskProcessing(job.type, task.type);

    try {
      logger.info({ msg: `handling ${job.type} job with ${task.type} task` });
      const { inputFiles, partsData, additionalParams } = job.parameters;

      const validAdditionalParams = this.validateAdditionalParams(additionalParams, swapUpdateAdditionalParamsSchema);
      const displayPath = randomUUID();

      const taskBuildParams: MergeTilesTaskParams = {
        inputFiles,
        partsData,
        taskMetadata: {
          tileOutputFormat: validAdditionalParams.tileOutputFormat,
          isNewTarget: true,
          layerRelativePath: `${job.internalId}/${displayPath}`,
          grid: Grid.TWO_ON_ONE,
        },
      };

      logger.info({ msg: 'building tasks' });
      const mergeTasks = this.taskBuilder.buildTasks(taskBuildParams);

      logger.info({ msg: 'pushing tasks' });
      await this.taskBuilder.pushTasks(job.id, job.type, mergeTasks);

      logger.info({ msg: 'Acking task' });
      await this.queueClient.ack(job.id, task.id);
      taskProcessTracking?.success();

      await this.updateJobAdditionalParams(job, validAdditionalParams, displayPath);
    } catch (err) {
      taskProcessTracking?.failure((err as Error).name);
      if (err instanceof ZodError) {
        const errorMsg = `Failed to validate additionalParams: ${err.message}`;
        logger.error({ msg: errorMsg, err });
        await this.queueClient.reject(job.id, task.id, false, err.message);
        return await this.queueClient.jobManagerClient.updateJob(job.id, { status: OperationStatus.FAILED, reason: errorMsg });
      }
      if (err instanceof Error) {
        logger.error({ msg: 'Failed to handle job init', error: err });
        await this.queueClient.reject(job.id, task.id, true, err.message);
      }
    }
  }

  public async handleJobFinalize(
    job: IJobResponse<IngestionUpdateJobParams, unknown>,
    task: ITaskResponse<IngestionSwapUpdateFinalizeTaskParams>
  ): Promise<void> {
    const logger = this.logger.child({ jobId: job.id, taskId: task.id, jobType: job.type, taskType: task.type });
    const taskProcessTracking = this.taskMetrics.trackTaskProcessing(job.type, task.type);

    try {
      logger.info({ msg: `handling ${job.type} job with ${task.type} task` });
      let finalizeTaskParams: IngestionSwapUpdateFinalizeTaskParams = task.parameters;
      const { updatedInCatalog, updatedInMapproxy } = finalizeTaskParams;
      const { layerName } = this.validateAndGenerateLayerNameFormats(job);
      const { additionalParams } = job.parameters;
      const { tileOutputFormat, displayPath } = this.validateAdditionalParams(additionalParams, updateAdditionalParamsSchema);

      if (!updatedInMapproxy) {
        const layerRelativePath = `${job.internalId}/${displayPath}`;
        logger.info({ msg: 'Updating layer in mapproxy', layerName, layerRelativePath, tileOutputFormat });
        await this.mapproxyClient.update(layerName, layerRelativePath, tileOutputFormat);
        finalizeTaskParams = await this.markFinalizeStepAsCompleted(job.id, task.id, finalizeTaskParams, 'updatedInMapproxy');
      }

      if (!updatedInCatalog) {
        logger.info({ msg: 'Updating layer in catalog', displayPath });
        await this.catalogClient.update(job);
        finalizeTaskParams = await this.markFinalizeStepAsCompleted(job.id, task.id, finalizeTaskParams, 'updatedInCatalog');
      }

      if (this.isAllStepsCompleted(finalizeTaskParams)) {
        logger.info({ msg: 'All finalize steps completed successfully', ...finalizeTaskParams });
        await this.completeTaskAndJob(job, task);
        taskProcessTracking?.success();
        await this.seedingJobCreator.create({ mode: SeedMode.CLEAN, layerName, ingestionJob: job });
      }
    } catch (err) {
      taskProcessTracking?.failure((err as Error).name);
      if (err instanceof ZodError) {
        const errorMsg = `Failed to validate additionalParams: ${err.message}`;
        logger.error({ msg: errorMsg, err });
        await this.queueClient.reject(job.id, task.id, false, err.message);
        return await this.queueClient.jobManagerClient.updateJob(job.id, { status: OperationStatus.FAILED, reason: errorMsg });
      }
      if (err instanceof Error) {
        const errorMsg = `Failed to handle job finalize: ${err.message}`;
        logger.error({ msg: errorMsg, error: err });
        await this.queueClient.reject(job.id, task.id, true, err.message);
      }
    }
  }

  private async updateJobAdditionalParams(
    job: IJobResponse<IngestionUpdateJobParams, unknown>,
    additionalParams: Record<string, unknown>,
    displayPath: string
  ): Promise<void> {
    const newAdditionalParams = { ...additionalParams, displayPath };
    this.logger.info({ msg: 'Updating job additional params with new displayPath', jobId: job.id, newAdditionalParams });
    return this.queueClient.jobManagerClient.updateJob(job.id, {
      parameters: { ...job.parameters, additionalParams: newAdditionalParams },
    });
  }
}
