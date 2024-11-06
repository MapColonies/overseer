/* eslint-disable @typescript-eslint/member-ordering */
import z from 'zod';
import { IJobResponse, ITaskResponse, OperationStatus, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { Logger } from '@map-colonies/js-logger';
import { layerNameSchema } from '../../utils/zod/schemas/jobParametersSchema';
import { FinalizeTaskParams, LayerNameFormats } from '../../common/interfaces';
import { COMPLETED_PERCENTAGE, JOB_SUCCESS_MESSAGE } from '../../common/constants';

export class JobHandler {
  public constructor(protected readonly logger: Logger, protected readonly queueClient: QueueClient) {}

  protected validateAndGenerateLayerNameFormats(job: IJobResponse<unknown, unknown>): LayerNameFormats {
    const layerName = layerNameSchema.parse(job);
    const { resourceId, productType } = layerName;
    this.logger.debug({ msg: 'layer name validation passed', resourceId, productType });

    return {
      geoserver: `${resourceId}_${productType}`,
      mapproxy: `${resourceId}-${productType}`,
    };
  }

  protected async markFinalizeStepAsCompleted<T extends FinalizeTaskParams>(
    jobId: string,
    taskId: string,
    finalizeTaskParams: T,
    step: keyof T
  ): Promise<T> {
    const updatedParams: T = { ...finalizeTaskParams, [step]: true };
    await this.queueClient.jobManagerClient.updateTask(jobId, taskId, { parameters: updatedParams });
    this.logger.debug({ msg: `finalization step completed`, step });
    return updatedParams;
  }

  protected isAllStepsCompleted<T>(steps: Record<keyof T, boolean>): boolean {
    this.logger.debug({ msg: 'checking if all steps are completed', steps });
    return Object.values(steps).every((step) => step);
  }

  protected validateAdditionalParams<T extends z.ZodSchema>(additionalParams: unknown, schema: T): z.infer<T> {
    const result = schema.safeParse(additionalParams);
    if (!result.success) {
      throw result.error;
    }
    this.logger.info({ msg: 'additionalParams validation passed', additionalParams });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return result.data as z.infer<T>;
  }

  protected async completeTaskAndJob(job: IJobResponse<unknown, unknown>, task: ITaskResponse<unknown>): Promise<void> {
    const logger = this.logger.child({ jobId: job.id, taskId: task.id, jobType: job.type, taskType: task.type });
    logger.info({ msg: 'acknowledging task' });
    await this.queueClient.ack(job.id, task.id);
    logger.info({ msg: 'updating job status to completed' });
    await this.queueClient.jobManagerClient.updateJob(job.id, {
      status: OperationStatus.COMPLETED,
      percentage: COMPLETED_PERCENTAGE,
      reason: JOB_SUCCESS_MESSAGE,
    });
  }
}
