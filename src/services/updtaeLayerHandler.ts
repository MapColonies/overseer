import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IJobResponse } from '@map-colonies/mc-priority-queue';
import { UpdateRasterLayer } from '@map-colonies/mc-model-types';
import { IJobHandler } from '../common/interfaces';
import { SERVICES } from '../common/constants';

@injectable()
export class UpdateLayerHandler implements IJobHandler {
  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger) {}

  public async handle(job: IJobResponse<UpdateRasterLayer, unknown>): Promise<void> {
    this.logger.info({ msg: 'handling update layer', metadata: { job } });
    await new Promise((resolve) => resolve('not implemented'));
  }
}
