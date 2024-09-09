import { setTimeout as setTimeoutPromise } from 'timers/promises';
import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { IJobResponse, OperationStatus, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { extractBindingsMetadata, LogContext } from '../../common/logging';
import { getAvailableJobTypes } from '../../utils/configUtil';
import { SERVICES } from '../../common/constants';
import { IConfig, IngestionConfig, JobAndTaskResponse, TaskResponse } from '../../common/interfaces';
import { JOB_HANDLER_FACTORY_SYMBOL, JobHandlerFactory } from './jobHandlerFactory';

@injectable()
export class JobProcessor {
  private readonly dequeueIntervalMs: number;
  private readonly logContext: LogContext;
  private readonly jobTypes: string[];
  private readonly pollingTaskTypes: string[];
  private readonly ingestionConfig: IngestionConfig;
  private isRunning = true;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(JOB_HANDLER_FACTORY_SYMBOL) private readonly jobHandlerFactory: JobHandlerFactory,
    @inject(SERVICES.QUEUE_CLIENT) private readonly queueClient: QueueClient
  ) {
    this.dequeueIntervalMs = this.config.get<number>('jobManagement.config.dequeueIntervalMs');
    this.ingestionConfig = this.config.get<IngestionConfig>('jobManagement.ingestion');
    const { jobs, pollingTasks } = this.ingestionConfig;
    this.jobTypes = getAvailableJobTypes(jobs);
    this.pollingTaskTypes = [pollingTasks.init, pollingTasks.finalize];
    this.logContext = {
      fileName: __filename,
      class: JobProcessor.name,
    };
  }

  public async start(): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.start.name };
    this.logger.info({ msg: 'starting polling', logContext: logCtx });
    while (this.isRunning) {
      await this.consumeAndProcess();
    }
  }

  public stop(): void {
    const logCtx: LogContext = { ...this.logContext, function: this.stop.name };
    this.logger.info({ msg: 'stopping polling', logContext: logCtx });
    this.isRunning = false;
  }

  private async consumeAndProcess(): Promise<void> {
    const logger = this.logger.child({ logContext: { ...this.logContext, function: this.consumeAndProcess.name } });
    let jobAndTask: JobAndTaskResponse | undefined = undefined;
    try {
      jobAndTask = await this.getJobAndTaskResponse();
      if (!jobAndTask) {
        logger.debug({ msg: 'waiting for next dequeue', metadata: { dequeueIntervalMs: this.dequeueIntervalMs } });
        await setTimeoutPromise(this.dequeueIntervalMs);
        return;
      }

      await this.processJob(jobAndTask);
    } catch (error) {
      if (error instanceof Error && jobAndTask) {
        const { job, task } = jobAndTask;
        logger.error({ msg: 'rejecting task', error, metadata: { job, task } });
        await this.queueClient.reject(job.id, task.id, true, error.message);
      }
      logger.debug({ msg: 'waiting for next dequeue', metadata: { dequeueIntervalMs: this.dequeueIntervalMs } });
      await setTimeoutPromise(this.dequeueIntervalMs);
    }
  }

  private async processJob(jobAndTask: JobAndTaskResponse): Promise<void> {
    const logger = this.logger.child({ logContext: { ...this.logContext, function: this.processJob.name } });
    const { job, task } = jobAndTask;
    try {
      const taskTypes = this.ingestionConfig.pollingTasks;
      const jobHandler = this.jobHandlerFactory(job.type);

      switch (task.type) {
        case taskTypes.init:
          await jobHandler.handleJobInit(job, task.id);
          break;
        case taskTypes.finalize:
          await jobHandler.handleJobFinalize(job, task.id);
          break;
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error({ msg: `failed processing the job: ${error.message}`, error });
      }
      throw error;
    }
  }

  private async getJobAndTaskResponse(): Promise<JobAndTaskResponse | undefined> {
    const logger = this.logger.child({ logContext: { ...this.logContext, function: this.getJobAndTaskResponse.name } });
    try {
      for (const taskType of this.pollingTaskTypes) {
        for (const jobType of this.jobTypes) {
          const { task, shouldSkipTask } = await this.getTask(jobType, taskType);

          if (shouldSkipTask) {
            logger.debug({ msg: `skipping task of type "${taskType}" and job of type "${jobType}"` });
            continue;
          }

          const job = await this.getJob(task.jobId);
          logger.info({ msg: `got job and task response`, jobId: job.id, jobType: job.type, taskId: task.id, taskType: task.type });

          return { job, task };
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error({ msg: `Failed to get job and task response: ${error.message}`, error });
      }
      throw error;
    }
  }

  private async getJob(jobId: string): Promise<IJobResponse<unknown, unknown>> {
    const logger = this.logger.child({ logContext: { ...this.logContext, function: this.getJob.name }, jobId });

    logger.info({ msg: `updating job status to ${OperationStatus.IN_PROGRESS}` });
    await this.queueClient.jobManagerClient.updateJob(jobId, { status: OperationStatus.IN_PROGRESS });

    const job = await this.queueClient.jobManagerClient.getJob(jobId);
    logger.info({ msg: `got job ${job.id}`, jobType: job.type });

    return job;
  }

  private async getTask(jobType: string, taskType: string): Promise<TaskResponse<unknown>> {
    const logger = this.logger.child({ metadata: { jobType, taskType }, logContext: { ...this.logContext, function: this.getTask.name } }, {});
    const metadata = extractBindingsMetadata(logger);

    logger.debug({ msg: `trying to dequeue task of type "${taskType}" and job of type "${jobType}"` });
    const task = await this.queueClient.dequeue(jobType, taskType);

    if (!task) {
      logger.debug({ msg: `no task of type "${taskType}" and job of type "${jobType}" found` });
      return { task: null, shouldSkipTask: true };
    }
    if (task.attempts >= this.ingestionConfig.maxTaskAttempts) {
      const message = `${taskType} task ${task.id} reached max attempts, rejects as unrecoverable`;
      logger.warn({ msg: message, taskId: task.id, attempts: task.attempts });
      await this.queueClient.reject(task.jobId, task.id, false);

      logger.error({ msg: `updating job status to ${OperationStatus.FAILED}`, metadata: { jobId: task.jobId, ...metadata } });
      await this.queueClient.jobManagerClient.updateJob(task.jobId, { status: OperationStatus.FAILED, reason: message });
      return { task: null, shouldSkipTask: true };
    }
    logger.info({ msg: `dequeued task ${task.id} successfully` });
    return { task, shouldSkipTask: false };
  }
}
