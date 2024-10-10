import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import { UpdateRasterLayer } from '@map-colonies/mc-model-types';
import { IJobHandler } from '../../common/interfaces';
import { SERVICES } from '../../common/constants';

@injectable()
export class SwapJobHandler implements IJobHandler {
  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger) {}

  public async handleJobInit(job: IJobResponse<UpdateRasterLayer, unknown>, taskId: string): Promise<void> {
    const logger = this.logger.child({ jobId: job.id, taskId });
    logger.info({ msg: `handling ${job.type} job with "init" task` });
    await Promise.reject('not implemented');
  }

  public async handleJobFinalize(job: IJobResponse<UpdateRasterLayer, unknown>, task: ITaskResponse<unknown>): Promise<void> {
    const logger = this.logger.child({ jobId: job.id, taskId: task.id });
    logger.info({ msg: `handling ${job.type} job with "finalize" task` });
    await Promise.reject('not implemented');
  }
}
