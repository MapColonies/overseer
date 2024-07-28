/* eslint-disable @typescript-eslint/naming-convention */
import { IngestionJobsConfig } from '../common/interfaces';
import { MissingConfigError } from '../common/errors';

export const getAvailableJobTypes = (ingestionConfig: IngestionJobsConfig): string[] => {
  const jobTypes: string[] = [];
  for (const jobKey in ingestionConfig) {
    if (Object.prototype.hasOwnProperty.call(ingestionConfig, jobKey)) {
      const job = ingestionConfig[jobKey];
      if (job === undefined) {
        continue;
      }
      jobTypes.push(job.type);
    }
  }
  return jobTypes;
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const validateAndGetHandlersTokens = (ingestionConfig: IngestionJobsConfig) => {
  if (ingestionConfig.new?.type === undefined) {
    throw new MissingConfigError('Missing "new-job" type configuration');
  }
  if (ingestionConfig.update?.type === undefined) {
    throw new MissingConfigError('Missing "update-job" type configuration');
  }
  if (ingestionConfig.swapUpdate?.type === undefined) {
    throw new MissingConfigError('Missing "swap-update-job" type configuration');
  }

  return {
    Ingestion_New: ingestionConfig.new.type,
    Ingestion_Update: ingestionConfig.update.type,
    Ingestion_Swap_Update: ingestionConfig.swapUpdate.type,
  } as const satisfies Record<string, string>;
};
