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
  private readonly initTaskType: string;
  private readonly dequeueIntervalMs: number;
  private isRunning = true;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(JOB_HANDLER_FACTORY_SYMBOL) private readonly jobHandlerFactory: JobHandlerFactory,
    @inject(SERVICES.QUEUE_CLIENT) private readonly queueClient: QueueClient
  ) {
    this.dequeueIntervalMs = this.config.get<number>('jobManagement.config.dequeueIntervalMs');
    const { jobs, init } = this.config.get<IngestionConfig>('jobManagement.ingestion');
    this.jobTypes = getAvailableJobTypes(jobs);
    this.initTaskType = init.taskType;

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
      const job = await this.getJob();

      if (!job) {
        await setTimeoutPromise(this.dequeueIntervalMs);
        return;
      }

      const jobHandler = this.jobHandlerFactory(job.type);
      await jobHandler.handleJob(job);
    } catch (error) {
      this.logger.error({ msg: 'Failed processing the job', error, logContext: logCtx });
      await setTimeoutPromise(this.dequeueIntervalMs);
    }
  }

  private async getJob(): Promise<IJobResponse<unknown, unknown> | undefined> {
    const logCtx: LogContext = { ...this.logContext, function: this.getJob.name };
    for (const jobType of this.jobTypes) {
      this.logger.debug({ msg: `try to dequeue task of type "${this.initTaskType}" and job of type "${jobType}"`, logContext: logCtx });
      const task = await this.queueClient.dequeue(jobType, this.initTaskType);

      if (!task) {
        continue;
      }

      this.logger.info({ msg: `dequeued task ${task.id}`, metadata: task, logContext: this.logContext });
      const job = await this.queueClient.jobManagerClient.getJob(task.jobId);
      this.logger.info({ msg: `got job ${job.id}`, metadata: job, logContext: this.logContext });
      return job;
    }
  }
}
