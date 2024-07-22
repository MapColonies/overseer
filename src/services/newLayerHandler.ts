import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IJobResponse } from '@map-colonies/mc-priority-queue';
import { NewRasterLayer } from '@map-colonies/mc-model-types';
import { IJobHandler } from '../common/interfaces';
import { SERVICES } from '../common/constants';

@injectable()
export class NewLayerHandler implements IJobHandler {
  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger) {}

  public async handle(job: IJobResponse<NewRasterLayer, unknown>): Promise<void> {
    this.logger.info({ msg: 'handling new layer', metadata: { job } });
    await new Promise((resolve) => resolve('not implemented'));
  }
}
