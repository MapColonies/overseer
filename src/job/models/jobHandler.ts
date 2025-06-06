import { ZodError } from 'zod';
import type { IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import { rasterProductTypeSchema } from '@map-colonies/raster-shared';
import type { LayerName } from '@map-colonies/raster-shared';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { SpanStatusCode } from '@opentelemetry/api';
import type { Logger } from '@map-colonies/js-logger';
import type { IConfig, JobAndTaskTelemetry, PollingConfig, StepKey } from '../../common/interfaces';
import { JobTrackerClient } from '../../httpClients/jobTrackerClient';

export class JobHandler {
  private readonly pollingConfig: PollingConfig;
  public constructor(
    protected readonly logger: Logger,
    protected readonly config: IConfig,
    protected readonly queueClient: QueueClient,
    private readonly jobTrackerClient: JobTrackerClient // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  ) {
    this.pollingConfig = config.get<PollingConfig>('jobManagement.polling');
  }

  protected validateAndGenerateLayerName(job: IJobResponse<unknown, unknown>): LayerName {
    const { resourceId, productType } = job;
    const validProductType = rasterProductTypeSchema.parse(productType);
    this.logger.debug({ msg: 'productType validation passed', resourceId, productType: validProductType });
    return `${resourceId}-${validProductType}`;
  }

  protected async markFinalizeStepAsCompleted<T>(jobId: string, taskId: string, finalizeTaskParams: T, step: StepKey<T>): Promise<T> {
    const updatedParams: T = { ...finalizeTaskParams, [step]: true };
    await this.queueClient.jobManagerClient.updateTask(jobId, taskId, { parameters: updatedParams });
    this.logger.debug({ msg: `finalization step completed`, step });
    return updatedParams;
  }

  protected isAllStepsCompleted<T>(steps: Record<keyof T, boolean>): boolean {
    this.logger.debug({ msg: 'checking if all steps are completed', steps });
    return Object.values(steps).every((step) => step);
  }

  protected async completeTask(job: IJobResponse<unknown, unknown>, task: ITaskResponse<unknown>, telemetry: JobAndTaskTelemetry): Promise<void> {
    const { taskTracker, tracingSpan } = telemetry;
    const logger = this.logger.child({ jobId: job.id, taskId: task.id, jobType: job.type, taskType: task.type });

    logger.info({ msg: 'acknowledging task' });
    tracingSpan?.addEvent('acknowledging.task');
    await this.queueClient.ack(job.id, task.id);
    await this.jobTrackerClient.notify(task);

    const successMsg = `${task.type} task completed successfully`;
    taskTracker?.success();
    tracingSpan?.setStatus({ code: SpanStatusCode.OK, message: successMsg });
    logger.info({ msg: successMsg });
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
    const taskAttempts = task.attempts + 1; // rejecting the task increments the attempts
    logger.info({ msg: 'task attempts', taskAttempts, maxAttempts: this.pollingConfig.maxTaskAttempts });
    const reachedMaxAttempts = taskAttempts >= this.pollingConfig.maxTaskAttempts;
    const isRecoverable = !(error instanceof ZodError) && !reachedMaxAttempts;

    await this.queueClient.reject(job.id, task.id, isRecoverable, reason);

    logger.error({ msg, reason, error, reachedMaxAttempts, isRecoverable });
    taskTracker?.failure(errName);
    tracingSpan?.setStatus({ code: SpanStatusCode.ERROR, message: reason });
    tracingSpan?.recordException(error instanceof Error ? error : new Error(reason));

    if (!isRecoverable) {
      await this.jobTrackerClient.notify(task);
    }
  }
}
