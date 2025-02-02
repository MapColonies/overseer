import { JobAndTaskTelemetry } from '../../../../src/common/interfaces';
import { ingestionNewJob } from '../../mocks/jobsMockData';
import { initTaskForIngestionNew } from '../../mocks/tasksMockData';
import { setupJobHandlerTest } from './jobHandlerSetup';

describe('JobHandler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('handleError', () => {
    it('should handle error', async () => {
      const { newJobHandler, queueClientMock } = setupJobHandlerTest();
      const job = ingestionNewJob;
      const task = initTaskForIngestionNew;
      const telemetry: JobAndTaskTelemetry = { taskTracker: undefined, tracingSpan: undefined };
      const error = 'unknown' as unknown as Error;

      await newJobHandler['handleError'](error, job, task, telemetry);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, true, expect.any(String));
    });
  });
});
