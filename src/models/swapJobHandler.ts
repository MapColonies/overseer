import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IJobResponse } from '@map-colonies/mc-priority-queue';
import { UpdateRasterLayer } from '@map-colonies/mc-model-types';
import { IJobHandler, LogContext } from '../common/interfaces';
import { SERVICES } from '../common/constants';

@injectable()
export class SwapJobHandler implements IJobHandler {
  private readonly logContext: LogContext;
  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger) {
    this.logContext = { fileName: __filename, class: SwapJobHandler.name };
  }

  public async handleJobInit(job: IJobResponse<UpdateRasterLayer, unknown>): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.handleJobInit.name };
    this.logger.info({ msg: 'handling "swap update" job "init"', metadata: { job }, logContext: logCtx });
    await Promise.reject('not implemented');
  }

  public async handleJobFinalize(job: IJobResponse<UpdateRasterLayer, unknown>): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.handleJobFinalize.name };
    this.logger.info({ msg: 'handling "swap update" job "finalize"', metadata: { job }, logContext: logCtx });
    await Promise.reject('not implemented');
  }
}
