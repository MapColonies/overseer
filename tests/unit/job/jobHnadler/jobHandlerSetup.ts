import jsLogger from '@map-colonies/js-logger';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { jobTrackerClientMock, queueClientMock } from '../../mocks/jobManagerMocks';
import { JobHandler } from '../../../../src/job/models/jobHandler';
import { JobTrackerClient } from '../../../../src/httpClients/jobTrackerClient';
import { configMock } from '../../mocks/configMock';

export interface JobHandlerTestContext {
  newJobHandler: JobHandler;
  queueClientMock: jest.Mocked<QueueClient>;
  jobTrackerClientMock: jest.Mocked<JobTrackerClient>;
}

export const setupJobHandlerTest = (): JobHandlerTestContext => {
  const newJobHandler = new JobHandler(jsLogger({ enabled: false }), configMock, queueClientMock, jobTrackerClientMock);

  return {
    newJobHandler,
    queueClientMock,
    jobTrackerClientMock,
  };
};
