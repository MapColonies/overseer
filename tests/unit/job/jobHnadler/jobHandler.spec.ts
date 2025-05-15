import { ZodError } from 'zod';
import { JobAndTaskTelemetry } from '../../../../src/common/interfaces';
import { registerDefaultConfig } from '../../mocks/configMock';
import { ingestionNewJob } from '../../mocks/jobsMockData';
import { initTaskForIngestionNew } from '../../mocks/tasksMockData';
import { setupJobHandlerTest } from './jobHandlerSetup';

describe('JobHandler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    registerDefaultConfig();
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

    it('should handle unrecoverable error', async () => {
      const { newJobHandler, queueClientMock, jobTrackerClientMock } = setupJobHandlerTest();
      const job = ingestionNewJob;
      const task = initTaskForIngestionNew;
      const telemetry: JobAndTaskTelemetry = { taskTracker: undefined, tracingSpan: undefined };
      const error = new ZodError([]);

      await newJobHandler['handleError'](error, job, task, telemetry);

      /* eslint-disable @typescript-eslint/unbound-method */
      expect(queueClientMock.reject).toHaveBeenCalledWith(job.id, task.id, false, error.message);
      expect(jobTrackerClientMock.notify).toHaveBeenCalledWith(task);
      /* eslint-enable @typescript-eslint/unbound-method */
    });
  });
});
