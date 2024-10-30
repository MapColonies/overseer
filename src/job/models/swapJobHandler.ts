import { randomUUID } from 'crypto';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IJobResponse, ITaskResponse, OperationStatus, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { ZodError } from 'zod';
import { IngestionSwapUpdateFinalizeTaskParams, IngestionUpdateJobParams, UpdateRasterLayer } from '@map-colonies/mc-model-types';
import { Grid, IJobHandler, MergeTilesTaskParams } from '../../common/interfaces';
import { TileMergeTaskManager } from '../../task/models/tileMergeTaskManager';
import { swapUpdateAdditionalParamsSchema } from '../../utils/zod/schemas/jobParametersSchema';
import { SERVICES } from '../../common/constants';
import { JobHandler } from './jobHandler';

@injectable()
export class SwapJobHandler extends JobHandler implements IJobHandler {
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.QUEUE_CLIENT) protected queueClient: QueueClient,
    @inject(TileMergeTaskManager) private readonly taskBuilder: TileMergeTaskManager
  ) {
    super(logger, queueClient);
  }

  public async handleJobInit(job: IJobResponse<IngestionUpdateJobParams, unknown>, taskId: string): Promise<void> {
    const logger = this.logger.child({ jobId: job.id, taskId, jobType: job.type });

    try {
      logger.info({ msg: `handling ${job.type} job with "init" task` });
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
      await this.taskBuilder.pushTasks(job.id, mergeTasks);

      logger.info({ msg: 'Acking task' });
      await this.queueClient.ack(job.id, taskId);

      await this.updateJobAdditionalParams(job, validAdditionalParams, displayPath);
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
    job: IJobResponse<UpdateRasterLayer, unknown>,
    task: ITaskResponse<IngestionSwapUpdateFinalizeTaskParams>
  ): Promise<void> {
    const logger = this.logger.child({ jobId: job.id, taskId: task.id });
    logger.info({ msg: `handling ${job.type} job with "finalize" task` });
    await Promise.reject('not implemented');
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
