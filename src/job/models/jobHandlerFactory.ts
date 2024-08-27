import { Logger } from '@map-colonies/js-logger';
import { DependencyContainer } from 'tsyringe';
import { IJobHandler } from '../../common/interfaces';
import { SERVICES } from '../../common/constants';
import { JobHandlerNotFoundError } from '../../common/errors';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const jobHandlerFactory = (container: DependencyContainer) => {
  const logger = container.resolve<Logger>(SERVICES.LOGGER);
  return (jobType: string): IJobHandler => {
    try {
      logger.info(`Getting job handler for job type ${jobType}`);
      const jobHandler = container.resolve<IJobHandler | null>(jobType);
      if (!jobHandler) {
        const errorMsg = `Job handler for job type ${jobType} not found`;
        logger.error(errorMsg);
        throw new JobHandlerNotFoundError(errorMsg);
      }
      return jobHandler;
    } catch (err) {
      if (err instanceof JobHandlerNotFoundError) {
        throw err;
      } else {
        const message = (err as Error).message;
        throw new Error(`Error in Job handler for job type ${jobType}: err:${message}`);
      }
    }
  };
};

export type JobHandlerFactory = ReturnType<typeof jobHandlerFactory>;
export const JOB_HANDLER_FACTORY_SYMBOL = Symbol(jobHandlerFactory.name);
