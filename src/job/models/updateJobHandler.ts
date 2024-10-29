import { ZodError } from 'zod';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { OperationStatus, TaskHandler as QueueClient, IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import { IngestionUpdateFinalizeTaskParams, IngestionUpdateJobParams } from '@map-colonies/mc-model-types';
import { CatalogClient } from '../../httpClients/catalogClient';
import { Grid, IConfig, IJobHandler, MergeTilesTaskParams } from '../../common/interfaces';
import { SERVICES } from '../../common/constants';
import { UpdateAdditionalParams, updateAdditionalParamsSchema } from '../../utils/zod/schemas/jobParametersSchema';
import { TileMergeTaskManager } from '../../task/models/tileMergeTaskManager';
import { JobHandler } from './jobHandler';

@injectable()
export class UpdateJobHandler extends JobHandler implements IJobHandler {
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(TileMergeTaskManager) private readonly taskBuilder: TileMergeTaskManager,
    @inject(SERVICES.QUEUE_CLIENT) protected queueClient: QueueClient,
    @inject(CatalogClient) private readonly catalogClient: CatalogClient
  ) {
    super(logger, queueClient);
  }

  public async handleJobInit(job: IJobResponse<IngestionUpdateJobParams, unknown>, taskId: string): Promise<void> {
    const logger = this.logger.child({ jobId: job.id, taskId, jobType: job.type });
    try {
      logger.info({ msg: `handling ${job.type} job with "init" task` });
      const { inputFiles, partsData, additionalParams } = job.parameters;

      const validAdditionalParams = this.validateAdditionalParams(additionalParams);

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
        finalizeTaskParams = await this.markFinalizeStepAsCompleted(job.id, task.id, 'updatedInCatalog', finalizeTaskParams);
      }

      if (this.isAllStepsCompleted(finalizeTaskParams)) {
        logger.info({ msg: 'All finalize steps completed successfully', ...finalizeTaskParams });
        await this.queueClient.ack(job.id, task.id);
        await this.queueClient.jobManagerClient.updateJob(job.id, { status: OperationStatus.COMPLETED, reason: 'Job completed successfully' });
      }
    } catch (err) {
      if (err instanceof Error) {
        const errorMsg = `Failed to handle job finalize: ${err.message}`;
        logger.error({ msg: errorMsg, error: err });
        await this.queueClient.reject(job.id, task.id, true, err.message);
      }
    }
  }

  private validateAdditionalParams(additionalParams: Record<string, unknown>): UpdateAdditionalParams {
    const validatedParams = updateAdditionalParamsSchema.parse(additionalParams);
    return validatedParams;
  }
}
