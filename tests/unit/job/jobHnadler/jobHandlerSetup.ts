import type { Mocked } from 'vitest';
import type { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { getTestLogger } from '../../../configurations/testLogger';
import { jobTrackerClientMock, queueClientMock } from '../../mocks/jobManagerMocks';
import { JobHandler } from '../../../../src/job/models/jobHandler';
import type { JobTrackerClient } from '../../../../src/httpClients/jobTrackerClient';
import { configMock } from '../../mocks/configMock';

export interface JobHandlerTestContext {
  newJobHandler: JobHandler;
  queueClientMock: Mocked<QueueClient>;
  jobTrackerClientMock: Mocked<JobTrackerClient>;
}

export const setupJobHandlerTest = async (): Promise<JobHandlerTestContext> => {
  const newJobHandler = new JobHandler(await getTestLogger(), configMock, queueClientMock, jobTrackerClientMock);

  return {
    newJobHandler,
    queueClientMock,
    jobTrackerClientMock,
  };
};
