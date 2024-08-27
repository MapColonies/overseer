import { setTimeout as setTimeoutPromise } from 'timers/promises';
import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { OperationStatus, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { getAvailableJobTypes } from '../../utils/configUtil';
import { SERVICES } from '../../common/constants';
import { IConfig, IngestionConfig, JobAndPhaseTask, LogContext } from '../../common/interfaces';
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
    let jobAndTaskType: JobAndPhaseTask | undefined = undefined;
    try {
      jobAndTaskType = await this.getJobWithPhaseTask();
      if (!jobAndTaskType) {
        await setTimeoutPromise(this.dequeueIntervalMs);
        return;
      }

      await this.processJob(jobAndTaskType);
    } catch (error) {
      if (error instanceof Error) {
        logger.error({ msg: `Failed processing the job: ${error.message}`, error });
        if (jobAndTaskType) {
          const { job, task } = jobAndTaskType;
          await this.queueClient.reject(job.id, task.id, true, error.message);
        }
      }
      await setTimeoutPromise(this.dequeueIntervalMs);
    }
  }

  private async processJob(jobAndTaskType: JobAndPhaseTask): Promise<void> {
    const { job, task } = jobAndTaskType;
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
  }

  private async getJobWithPhaseTask(): Promise<JobAndPhaseTask | undefined> {
    const logger = this.logger.child({ logContext: { ...this.logContext, function: this.getJobWithPhaseTask.name } });
    for (const taskType of this.pollingTaskTypes) {
      for (const jobType of this.jobTypes) {
        logger.debug({ msg: `trying to dequeue task of type "${taskType}" and job of type "${jobType}"` });
        const task = await this.queueClient.dequeue(jobType, taskType);
        if (!task) {
          logger.debug({ msg: `no task of type "${taskType}" and job of type "${jobType}" found` });
          continue;
        }
        if (task.attempts === this.ingestionConfig.taskMaxTaskAttempts) {
          logger.warn({ msg: `task ${task.id} reached max attempts, skipping`, metadata: task });
          continue;
        }
        logger.info({ msg: `dequeued task ${task.id}`, metadata: task });

        await this.queueClient.jobManagerClient.updateJob(task.jobId, { status: OperationStatus.IN_PROGRESS });
        const job = await this.queueClient.jobManagerClient.getJob(task.jobId);
        logger.info({ msg: `got job ${job.id}`, metadata: job });
        return { job, task };
      }
    }
  }
}
