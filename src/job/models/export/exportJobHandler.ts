import { inject, injectable } from 'tsyringe';
import { type Logger } from '@map-colonies/js-logger';
import { Tracer } from '@opentelemetry/api';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { SERVICES } from '../../../common/constants';
import { JobHandler } from '../jobHandler';
import { TaskMetrics } from '../../../utils/metrics/taskMetrics';
import { IJobHandler } from '../../../common/interfaces';
import { ExportInitJob, ExportInitTask } from '../../../utils/zod/schemas/job.schema';

@injectable()
export class ExportJobHandler extends JobHandler implements IJobHandler<ExportInitJob, ExportInitTask> {
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    @inject(SERVICES.QUEUE_CLIENT) queueClient: QueueClient,
    private readonly taskMetrics: TaskMetrics
  ) {
    super(logger, queueClient);
  }
  public async handleJobInit(job: ExportInitJob, task: ExportInitTask): Promise<void> {
    await Promise.resolve();
  }
  public async handleJobFinalize(job: unknown, task: unknown): Promise<void> {
    await Promise.resolve();
    throw new Error('Method not implemented.');
  }
}
