/* eslint-disable @typescript-eslint/naming-convention */
import { INSTANCE_TYPES } from '../common/constants';
import { InvalidConfigError, MissingConfigError } from '../common/errors';
import type { JobManagementConfig, PollingJobs } from '../common/interfaces';
import { instanceTypeSchema, type InstanceType } from './zod/schemas/instance.schema';

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

export const validateAndGetHandlersTokens = (pollingConfig: PollingJobs, instanceType: InstanceType): Record<string, string> => {
  const { new: newJob, update: updateJob, swapUpdate: swapUpdateJob, export: exportJob } = pollingConfig;

  switch (instanceType) {
    case 'ingestion': {
      if (newJob?.type === undefined || isStringEmpty(newJob.type)) {
        throw new MissingConfigError('Missing "new-job" type configuration');
      }
      if (updateJob?.type === undefined || isStringEmpty(updateJob.type)) {
        throw new MissingConfigError('Missing "update-job" type configuration');
      }
      if (swapUpdateJob?.type === undefined || isStringEmpty(swapUpdateJob.type)) {
        throw new MissingConfigError('Missing "swap-update-job" type configuration');
      }

      return { Ingestion_New: newJob.type, Ingestion_Update: updateJob.type, Ingestion_Swap_Update: swapUpdateJob.type };
    }
    case 'export': {
      if (exportJob?.type === undefined || isStringEmpty(exportJob.type)) {
        throw new MissingConfigError('Missing "export-job" type configuration');
      }

      return { Export: exportJob.type };
    }
    default:
      throw new MissingConfigError('No valid handlers found for the specified instance type');
  }
};

export const getPollingJobs = (jobManagementConfig: JobManagementConfig, instanceType: InstanceType): PollingJobs => {
  switch (instanceType) {
    case 'ingestion':
      return jobManagementConfig.ingestion.pollingJobs;
    case 'export':
      return jobManagementConfig.export.pollingJobs;
  }
};

export const parseInstanceType = (instanceType: string): InstanceType => {
  try {
    return instanceTypeSchema.parse(instanceType);
  } catch (err) {
    throw new InvalidConfigError(`Invalid configuration for "instanceType". supported values: (${INSTANCE_TYPES.join(',')})`);
  }
};
