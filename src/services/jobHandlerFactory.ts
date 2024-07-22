import { Logger } from '@map-colonies/js-logger';
import { DependencyContainer } from 'tsyringe';
import { IJobHandler } from '../common/interfaces';
import { SERVICES } from '../common/constants';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const jobHandlerFactory = (container: DependencyContainer) => {
  const logger = container.resolve<Logger>(SERVICES.LOGGER);
  return (jobType: string): IJobHandler => {
    const jobHandler = container.resolve<IJobHandler | null>(jobType);
    if (!jobHandler) {
      logger.error({ msg: `Job handler for job type ${jobType} not found` });
      throw new Error(`Job handler for job type ${jobType} not found`);
    }
    return jobHandler;
  };
};

export type JobHandlerFactory = ReturnType<typeof jobHandlerFactory>;
export const JOB_HANDLER_FACTORY_SYMBOL = Symbol('jobHandlerFactory');
