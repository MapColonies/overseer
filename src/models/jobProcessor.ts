import { setTimeout as setTimeoutPromise } from 'timers/promises';
import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { IJobResponse } from '@map-colonies/mc-priority-queue';
import { getAvailableJobTypes } from '../utils/configUtil';
import { SERVICES } from '../common/constants';
import { IConfig, IngestionConfig, LogContext } from '../common/interfaces';
import { JOB_HANDLER_FACTORY_SYMBOL, JobHandlerFactory } from './jobHandlerFactory';

@injectable()
export class JobProcessor {
  private readonly logContext: LogContext;
  private readonly jobTypes: string[];
  private readonly pollingTaskTypes: string[];
  private readonly dequeueIntervalMs: number;
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
    const logCtx: LogContext = { ...this.logContext, function: this.consumeAndProcess.name };
    try {
      const jobAndTaskType = await this.getJobWithTaskType();

      if (!jobAndTaskType) {
        await setTimeoutPromise(this.dequeueIntervalMs);
        return;
      }

      await this.processJob(jobAndTaskType);
    } catch (error) {
      this.logger.error({ msg: 'Failed processing the job', error, logContext: logCtx });
      await setTimeoutPromise(this.dequeueIntervalMs);
    }
  }

  private async processJob(jobAndTaskType: { job: IJobResponse<unknown, unknown>; taskType: string }): Promise<void> {
    const { job, taskType } = jobAndTaskType;
    const taskTypes = this.ingestionConfig.pollingTasks;
    const jobHandler = this.jobHandlerFactory(job.type);

    switch (taskType) {
      case taskTypes.init:
        await jobHandler.handleJobInit(job);
        break;
      case taskTypes.finalize:
        await jobHandler.handleJobFinalize(job);
        break;
    }
  }

  private async getJobWithTaskType(): Promise<{ job: IJobResponse<unknown, unknown>; taskType: string } | undefined> {
    const logCtx: LogContext = { ...this.logContext, function: this.getJobWithTaskType.name };
    for (const taskType of this.pollingTaskTypes) {
      for (const jobType of this.jobTypes) {
        this.logger.debug({ msg: `try to dequeue task of type "${taskType}" and job of type "${jobType}"`, logContext: logCtx });
        const task = await this.queueClient.dequeue(jobType, taskType);

        if (!task) {
          continue;
        }
        this.logger.info({ msg: `dequeued task ${task.id}`, metadata: task, logContext: this.logContext });
        const job = await this.queueClient.jobManagerClient.getJob(task.jobId);
        this.logger.info({ msg: `got job ${job.id}`, metadata: job, logContext: this.logContext });
        return { job, taskType: task.type };
      }
    }
  }
}
