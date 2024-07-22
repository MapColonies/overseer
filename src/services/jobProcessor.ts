import { setTimeout as setTimeoutPromise } from 'timers/promises';
import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { IJobResponse } from '@map-colonies/mc-priority-queue';
import { QueueClient } from '../clients/queueClient';
import { SERVICES } from '../common/constants';
import { IConfig, IQueueConfig, LogContext } from '../common/interfaces';
import { JOB_HANDLER_FACTORY_SYMBOL, JobHandlerFactory } from './jobHandlerFactory';

@injectable()
export class JobProcessor {
  private readonly logContext: LogContext;
  private readonly jobTypes;
  private readonly initTaskType;
  private readonly dequeueIntervalMs: number;
  private readonly isRunning = true;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(JOB_HANDLER_FACTORY_SYMBOL) private readonly jobHandlerFactory: JobHandlerFactory,
    private readonly queueClient: QueueClient
  ) {
    const { jobTypes, initTaskType, dequeueIntervalMs } = this.config.get<IQueueConfig>('queue');
    this.dequeueIntervalMs = dequeueIntervalMs;
    this.jobTypes = jobTypes;
    this.initTaskType = initTaskType;
    this.logContext = {
      fileName: __filename,
      class: JobProcessor.name,
    };
  }

  public async consumeAndProcess(): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.consumeAndProcess.name };
    try {
      for await (const job of this.getJob()) {
        const jobHandler = this.jobHandlerFactory(job.type);
        await jobHandler.handle(job);
      }
    } catch (error) {
      this.logger.fatal({ msg: 'error in main loop', error, logContext: logCtx });
      await setTimeoutPromise(this.dequeueIntervalMs);
    }
  }

  private async *getJob(): AsyncGenerator<IJobResponse<unknown, unknown>> {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (this.isRunning) {
      for (const jobType of this.jobTypes) {
        const task = await this.queueClient.queueHandler.dequeue(jobType, this.initTaskType);

        if (!task) {
          continue;
        }
        this.logger.info({ msg: `dequeued task ${task.id}`, metadata: task, logContext: this.logContext });
        const job = await this.queueClient.queueHandler.jobManagerClient.getJob(task.jobId);
        this.logger.info({ msg: `got job ${job.id}`, metadata: job, logContext: this.logContext });
        yield job;
      }
      await setTimeoutPromise(this.dequeueIntervalMs);
    }
  }
}
