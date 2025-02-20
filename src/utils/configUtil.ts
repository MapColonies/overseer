/* eslint-disable @typescript-eslint/naming-convention */
import type { PollingJobs } from '../common/interfaces';
import { MissingConfigError } from '../common/errors';

function isStringEmpty(str: string): boolean {
  return typeof str === 'string' && str.trim().length === 0;
}

export const getAvailableJobTypes = (ingestionConfig: PollingJobs): string[] => {
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
export const validateAndGetHandlersTokens = (pollingConfig: PollingJobs) => {
  const { new: newJob, update: updateJob, swapUpdate: swapUpdateJob, export: exportJob } = pollingConfig;

  if (newJob?.type === undefined || isStringEmpty(newJob.type)) {
    throw new MissingConfigError('Missing "new-job" type configuration');
  }
  if (updateJob?.type === undefined || isStringEmpty(updateJob.type)) {
    throw new MissingConfigError('Missing "update-job" type configuration');
  }
  if (swapUpdateJob?.type === undefined || isStringEmpty(swapUpdateJob.type)) {
    throw new MissingConfigError('Missing "swap-update-job" type configuration');
  }
  if (exportJob?.type === undefined || isStringEmpty(exportJob.type)) {
    throw new MissingConfigError('Missing "export-job" type configuration');
  }

  return {
    Ingestion_New: newJob.type,
    Ingestion_Update: updateJob.type,
    Ingestion_Swap_Update: swapUpdateJob.type,
    Export: exportJob.type,
  } as const satisfies Record<string, string>;
};

export type IngestionJobTypes = ReturnType<typeof validateAndGetHandlersTokens>;
