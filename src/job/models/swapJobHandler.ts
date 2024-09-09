import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IJobResponse } from '@map-colonies/mc-priority-queue';
import { UpdateRasterLayer } from '@map-colonies/mc-model-types';
import { IJobHandler } from '../../common/interfaces';
import { SERVICES } from '../../common/constants';
import { LogContext } from '../../common/logging';

@injectable()
export class SwapJobHandler implements IJobHandler {
  private readonly logContext: LogContext;
  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger) {
    this.logContext = { fileName: __filename, class: SwapJobHandler.name };
  }

  public async handleJobInit(job: IJobResponse<UpdateRasterLayer, unknown>, taskId: string): Promise<void> {
    const logger = this.logger.child({ jobId: job.id, taskId, logContext: { ...this.logContext, function: this.handleJobInit.name } });
    logger.info({ msg: `handling ${job.type} job with "init" task` });
    await Promise.reject('not implemented');
  }

  public async handleJobFinalize(job: IJobResponse<UpdateRasterLayer, unknown>, taskId: string): Promise<void> {
    const logger = this.logger.child({ jobId: job.id, taskId, logContext: { ...this.logContext, function: this.handleJobFinalize.name } });
    logger.info({ msg: `handling ${job.type} job with "finalize" task` });
    await Promise.reject('not implemented');
  }
}
