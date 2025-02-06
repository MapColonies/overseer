import { setTimeout as setTimeoutPromise } from 'timers/promises';
import { Logger } from '@map-colonies/js-logger';
import { SpanStatusCode, Tracer } from '@opentelemetry/api';
import { inject, injectable } from 'tsyringe';
import { IJobResponse, OperationStatus, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { ZodError } from 'zod';
import { getAvailableJobTypes } from '../../utils/configUtil';
import { SERVICES } from '../../common/constants';
import { jobTaskSchemaMap, OperationValidationKey } from '../../utils/zod/schemas/job.schema';
import { IConfig, PollingConfig, JobAndTaskResponse, TaskResponse } from '../../common/interfaces';
import { JOB_HANDLER_FACTORY_SYMBOL, JobHandlerFactory } from './jobHandlerFactory';

@injectable()
export class JobProcessor {
  private readonly dequeueIntervalMs: number;
  private readonly pollingJobTypes: string[];
  private readonly pollingTaskTypes: string[];
  private readonly pollingConfig: PollingConfig;
  private isRunning = true;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.TRACER) private readonly tracer: Tracer,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(JOB_HANDLER_FACTORY_SYMBOL) private readonly jobHandlerFactory: JobHandlerFactory,
    @inject(SERVICES.QUEUE_CLIENT) private readonly queueClient: QueueClient
  ) {
    this.dequeueIntervalMs = this.config.get<number>('jobManagement.config.dequeueIntervalMs');
    this.pollingConfig = this.config.get<PollingConfig>('jobManagement.polling');
    const { jobs, tasks } = this.pollingConfig;
    this.pollingJobTypes = getAvailableJobTypes(jobs);
    this.pollingTaskTypes = [tasks.init, tasks.finalize];
  }

  public async start(): Promise<void> {
    this.logger.info({ msg: 'starting polling' });
    while (this.isRunning) {
      await this.consumeAndProcess();
    }
  }

  public stop(): void {
    this.logger.info({ msg: 'stopping polling' });
    this.isRunning = false;
  }

  private async consumeAndProcess(): Promise<void> {
    let jobAndTask: JobAndTaskResponse | undefined = undefined;
    try {
      jobAndTask = await this.getJobAndTaskResponse();
      if (!jobAndTask) {
        this.logger.debug({ msg: 'waiting for next dequeue', dequeueIntervalMs: this.dequeueIntervalMs });
        await setTimeoutPromise(this.dequeueIntervalMs);
        return;
      }
      this.validateTaskAndJob(jobAndTask);

      await this.processJob(jobAndTask);
    } catch (error) {
      if (error instanceof Error && jobAndTask) {
        const isRecoverable = !(error instanceof ZodError);
        const { job, task } = jobAndTask;
        this.logger.error({ msg: 'rejecting task', error, jobId: job.id, taskId: task.id });
        await this.queueClient.reject(job.id, task.id, isRecoverable, error.message);
        if (!isRecoverable) {
          await this.queueClient.jobManagerClient.updateJob(job.id, { status: OperationStatus.FAILED, reason: error.message });
        }
      }
      this.logger.debug({ msg: 'waiting for next dequeue', dequeueIntervalMs: this.dequeueIntervalMs });
      await setTimeoutPromise(this.dequeueIntervalMs);
    }
  }

  private async processJob(jobAndTask: JobAndTaskResponse): Promise<void> {
    const { job, task } = jobAndTask;
    await this.tracer.startActiveSpan(`${JobProcessor.name}.${this.processJob.name}.${job.type}.${task.type}`, async (span) => {
      span.setAttributes({
        jobId: job.id,
        jobType: job.type,
        taskId: task.id,
        taskType: task.type,
        taskAttempts: task.attempts,
      });

      try {
        const taskTypes = this.pollingConfig.tasks;
        const jobHandler = this.jobHandlerFactory(job.type);

        switch (task.type) {
          case taskTypes.init:
            await jobHandler.handleJobInit(job, task);
            break;
          case taskTypes.finalize:
            await jobHandler.handleJobFinalize(job, task);
            break;
        }
      } catch (error) {
        if (error instanceof Error) {
          this.logger.error({ msg: `failed processing the job: ${error.message}`, error });
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          span.recordException(error);
        }
        throw error;
      } finally {
        span.end();
      }
    });
  }

  private async getJobAndTaskResponse(): Promise<JobAndTaskResponse | undefined> {
    try {
      for (const taskType of this.pollingTaskTypes) {
        for (const jobType of this.pollingJobTypes) {
          const { task, shouldSkipTask } = await this.getTask(jobType, taskType);

          if (shouldSkipTask) {
            this.logger.debug({ msg: `skipping task of type "${taskType}" and job of type "${jobType}"` });
            continue;
          }

          const job = await this.getJob(task.jobId);
          this.logger.info({ msg: `got job and task response`, jobId: job.id, jobType: job.type, taskId: task.id, taskType: task.type });

          return { job, task };
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error({ msg: `Failed to get job and task response: ${error.message}`, error });
      }
      throw error;
    }
  }

  private async getJob(jobId: string): Promise<IJobResponse<unknown, unknown>> {
    const logger = this.logger.child({ jobId });

    logger.info({ msg: `updating job status to ${OperationStatus.IN_PROGRESS}` });
    await this.queueClient.jobManagerClient.updateJob(jobId, { status: OperationStatus.IN_PROGRESS });

    const job = await this.queueClient.jobManagerClient.getJob(jobId);
    logger.info({ msg: `got job ${job.id}`, jobType: job.type });

    return job;
  }

  private async getTask(jobType: string, taskType: string): Promise<TaskResponse<unknown>> {
    const logger = this.logger.child({ jobType, taskType });

    logger.debug({ msg: `trying to dequeue task of type "${taskType}" and job of type "${jobType}"` });
    const task = await this.queueClient.dequeue(jobType, taskType);

    if (!task) {
      logger.debug({ msg: `no task of type "${taskType}" and job of type "${jobType}" found` });
      return { task: null, shouldSkipTask: true };
    }
    if (task.attempts >= this.pollingConfig.maxTaskAttempts) {
      const message = `${taskType} task ${task.id} reached max attempts, rejects as unrecoverable`;
      logger.warn({ msg: message, taskId: task.id, attempts: task.attempts });
      await this.queueClient.reject(task.jobId, task.id, false);

      logger.error({ msg: `updating job status to ${OperationStatus.FAILED}`, jobId: task.jobId });
      await this.queueClient.jobManagerClient.updateJob(task.jobId, { status: OperationStatus.FAILED, reason: message });
      return { task: null, shouldSkipTask: true };
    }
    logger.info({ msg: `dequeued task ${task.id} successfully` });
    return { task, shouldSkipTask: false };
  }
  private validateTaskAndJob(jobAndTask: JobAndTaskResponse): void {
    const { job, task } = jobAndTask;
    const logger = this.logger.child({ jobId: job.id, jobType: job.type, taskId: task.id, taskType: task.type });
    const validationKey = `${job.type}_${task.type}` as OperationValidationKey;
    const validationSchemas = jobTaskSchemaMap[validationKey];

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (validationSchemas === undefined) {
      throw new Error(`no validation schema found for job type ${job.type} and task type ${task.type}`);
    }
    const { jobSchema, taskSchema } = validationSchemas;

    logger.info({ msg: 'validating job and task', jobSchema: jobSchema.description, taskSchema: taskSchema.description });

    jobSchema.parse(job);

    logger.info({ msg: 'job validated successfully' });

    taskSchema.parse(task);
    logger.info({ msg: 'task validated successfully' });
  }
}
