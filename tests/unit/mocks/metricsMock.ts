/* eslint-disable @typescript-eslint/no-unused-vars */
import { OperationStatus } from '@map-colonies/mc-priority-queue';
import { TaskMetrics } from '../../../src/utils/metrics/taskMetrics';

const taskProcessTrackingMock: {
  success: () => void;
  failure: (errorType: string) => void;
} = {
  success: () => {},
  failure: (errorType: string) => {},
};

export const taskMetricsMock = {
  trackTaskProcessing: jest.fn().mockReturnValue(taskProcessTrackingMock),
  trackTasksEnqueue: jest.fn().mockReturnValue(void 0),
  resetTrackTasksEnqueue: jest.fn().mockReturnValue(void 0),
} as unknown as jest.Mocked<TaskMetrics>;
