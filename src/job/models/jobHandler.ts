/* eslint-disable @typescript-eslint/member-ordering */
import { IJobResponse, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { Logger } from '@map-colonies/js-logger';
import { layerNameSchema } from '../../utils/zod/schemas/jobParametersSchema';
import { FinalizeTaskParams } from '../../common/interfaces';

export class JobHandler {
  public constructor(protected readonly logger: Logger, protected readonly queueClient: QueueClient) {}

  protected validateAndGenerateLayerName(job: IJobResponse<unknown, unknown>): string {
    const layerName = layerNameSchema.parse(job);
    const { resourceId, productType } = layerName;
    this.logger.debug({ msg: 'layer name validation passed', resourceId, productType });
    return `${resourceId}_${productType}`;
  }

  protected async markFinalizeStepAsCompleted<T extends FinalizeTaskParams>(
    jobId: string,
    taskId: string,
    step: keyof T,
    finalizeTaskParams: T
  ): Promise<T> {
    const updatedParams: T = { ...finalizeTaskParams, [step]: true };
    await this.queueClient.jobManagerClient.updateTask(jobId, taskId, { parameters: updatedParams });
    this.logger.debug({ msg: `finalization  step completed`, step });
    return updatedParams;
  }

  protected isAllStepsCompleted<T>(steps: Record<keyof T, boolean>): boolean {
    this.logger.debug({ msg: 'checking if all steps are completed', steps });
    return Object.values(steps).every((step) => step);
  }
}
