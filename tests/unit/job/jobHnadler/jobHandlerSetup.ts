import jsLogger from '@map-colonies/js-logger';
import { JobManagerClient, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { jobManagerClientMock, queueClientMock } from '../../mocks/jobManagerMocks';
import { JobHandler } from '../../../../src/job/models/jobHandler';

export interface JobHandlerTestContext {
  newJobHandler: JobHandler;
  queueClientMock: jest.Mocked<QueueClient>;
  jobManagerClientMock: jest.Mocked<JobManagerClient>;
}

export const setupJobHandlerTest = (): JobHandlerTestContext => {
  const newJobHandler = new JobHandler(jsLogger({ enabled: false }), queueClientMock);

  return {
    newJobHandler,
    queueClientMock,
    jobManagerClientMock,
  };
};
