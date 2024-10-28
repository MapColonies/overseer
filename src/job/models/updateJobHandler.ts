import { ZodError } from 'zod';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { OperationStatus, TaskHandler as QueueClient, IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import { IngestionUpdateJobParams, UpdateRasterLayer } from '@map-colonies/mc-model-types';
import { Grid, IConfig, IJobHandler, MergeTilesTaskParams } from '../../common/interfaces';
import { SERVICES } from '../../common/constants';
import { UpdateAdditionalParams, updateAdditionalParamsSchema } from '../../utils/zod/schemas/jobParametersSchema';
import { TileMergeTaskManager } from '../../task/models/tileMergeTaskManager';

@injectable()
export class UpdateJobHandler implements IJobHandler {
  private readonly isNewTarget: boolean;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(TileMergeTaskManager) private readonly taskBuilder: TileMergeTaskManager,
    @inject(SERVICES.QUEUE_CLIENT) private readonly queueClient: QueueClient
  ) {
    this.isNewTarget = config.get<boolean>('jobManagement.ingestion.tasks.tilesMerging.useNewTargetFlagInUpdate');
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
          isNewTarget: this.isNewTarget,
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

  public async handleJobFinalize(job: IJobResponse<UpdateRasterLayer, unknown>, task: ITaskResponse<unknown>): Promise<void> {
    const logger = this.logger.child({ jobId: job.id, taskId: task.id });
    logger.info({ msg: `handling ${job.type} job with "finalize" task` });
    await Promise.reject('not implemented');
  }

  private validateAdditionalParams(additionalParams: Record<string, unknown>): UpdateAdditionalParams {
    const validatedParams = updateAdditionalParamsSchema.parse(additionalParams);
    return validatedParams;
  }
}
