import { setTimeout as setTimeoutPromise } from 'timers/promises';
import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { IJobResponse, OperationStatus, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { getAvailableJobTypes } from '../../utils/configUtil';
import { SERVICES } from '../../common/constants';
import { IConfig, IngestionConfig, JobAndTaskResponse, TaskResponse } from '../../common/interfaces';
import { JOB_HANDLER_FACTORY_SYMBOL, JobHandlerFactory } from './jobHandlerFactory';

@injectable()
export class JobProcessor {
  private readonly dequeueIntervalMs: number;
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

      await this.processJob(jobAndTask);
    } catch (error) {
      if (error instanceof Error && jobAndTask) {
        const { job, task } = jobAndTask;
        this.logger.error({ msg: 'rejecting task', error, jobId: job.id, taskId: task.id });
        await this.queueClient.reject(job.id, task.id, true, error.message);
      }
      this.logger.debug({ msg: 'waiting for next dequeue', dequeueIntervalMs: this.dequeueIntervalMs });
      await setTimeoutPromise(this.dequeueIntervalMs);
    }
  }

  private async processJob(jobAndTask: JobAndTaskResponse): Promise<void> {
    const { job, task } = jobAndTask;
    try {
      const taskTypes = this.ingestionConfig.pollingTasks;
      const jobHandler = this.jobHandlerFactory(job.type);

      switch (task.type) {
        case taskTypes.init:
          await jobHandler.handleJobInit(job, task.id);
          break;
        case taskTypes.finalize:
          await jobHandler.handleJobFinalize(job, task);
          break;
      }
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error({ msg: `failed processing the job: ${error.message}`, error });
      }
      throw error;
    }
  }

  private async getJobAndTaskResponse(): Promise<JobAndTaskResponse | undefined> {
    try {
      for (const taskType of this.pollingTaskTypes) {
        for (const jobType of this.jobTypes) {
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
    if (task.attempts >= this.ingestionConfig.maxTaskAttempts) {
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
}
