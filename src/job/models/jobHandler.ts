import { ZodError } from 'zod';
import { IJobResponse, ITaskResponse, OperationStatus, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { SpanStatusCode } from '@opentelemetry/api';
import { Logger } from '@map-colonies/js-logger';
import { layerNameSchema } from '../../utils/zod/schemas/jobParameters.schema';
import { FinalizeTaskParams, JobAndTaskTelemetry, LayerName } from '../../common/interfaces';
import { COMPLETED_PERCENTAGE, JOB_SUCCESS_MESSAGE } from '../../common/constants';

export class JobHandler {
  public constructor(protected readonly logger: Logger, protected readonly queueClient: QueueClient) {}

  protected validateAndGenerateLayerName(job: IJobResponse<unknown, unknown>): LayerName {
    const layerName = layerNameSchema.parse(job);
    const { resourceId, productType } = layerName;
    this.logger.debug({ msg: 'layer name validation passed', resourceId, productType });
    return `${resourceId}-${productType}`;
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

  protected async completeInitTask(job: IJobResponse<unknown, unknown>, task: ITaskResponse<unknown>, telemetry: JobAndTaskTelemetry): Promise<void> {
    const { taskTracker, tracingSpan } = telemetry;
    const logger = this.logger.child({ jobId: job.id, taskId: task.id, jobType: job.type, taskType: task.type });

    logger.info({ msg: 'Acking task' });
    await this.queueClient.ack(job.id, task.id);

    const successMsg = `${task.type} task completed successfully`;
    taskTracker?.success();
    tracingSpan?.setStatus({ code: SpanStatusCode.OK, message: successMsg });
    logger.info({ msg: successMsg });
  }

  protected async completeTaskAndJob(
    job: IJobResponse<unknown, unknown>,
    task: ITaskResponse<unknown>,
    telemetry: JobAndTaskTelemetry
  ): Promise<void> {
    const { taskTracker, tracingSpan } = telemetry;
    const logger = this.logger.child({ jobId: job.id, taskId: task.id, jobType: job.type, taskType: task.type });

    logger.info({ msg: 'acknowledging task' });
    tracingSpan?.addEvent('acknowledging.task');
    await this.queueClient.ack(job.id, task.id);

    logger.info({ msg: 'updating job status to completed' });
    await this.queueClient.jobManagerClient.updateJob(job.id, {
      status: OperationStatus.COMPLETED,
      percentage: COMPLETED_PERCENTAGE,
      reason: JOB_SUCCESS_MESSAGE,
    });

    taskTracker?.success();
    tracingSpan?.setStatus({ code: SpanStatusCode.OK, message: JOB_SUCCESS_MESSAGE });
  }

  protected async handleError(
    error: unknown,
    job: IJobResponse<unknown, unknown>,
    task: ITaskResponse<unknown>,
    telemetry: JobAndTaskTelemetry
  ): Promise<void> {
    const { taskTracker, tracingSpan } = telemetry;
    const logger = this.logger.child({ jobId: job.id, taskId: task.id, jobType: job.type, taskType: task.type });
    const errName = error instanceof Error ? error.name : 'unknown';
    const msg = `Failed to handle ${job.type} job with ${task.type} task`;
    const reason = error instanceof Error ? error.message : String(error);
    const isRecoverable = !(error instanceof ZodError);

    await this.queueClient.reject(job.id, task.id, isRecoverable, reason);
    logger.error({ msg, reason, error });
    taskTracker?.failure(errName);
    tracingSpan?.setStatus({ code: SpanStatusCode.ERROR, message: reason });
    tracingSpan?.recordException(error instanceof Error ? error : new Error(reason));

    if (!isRecoverable) {
      await this.queueClient.jobManagerClient.updateJob(job.id, { status: OperationStatus.FAILED, reason: error.message });
    }
  }
}
