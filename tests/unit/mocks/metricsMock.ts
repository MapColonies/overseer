import type { Mocked } from 'vitest';
/* eslint-disable @typescript-eslint/no-unused-vars */
import { OperationStatus } from '@map-colonies/mc-priority-queue';
import type { TaskMetrics } from '../../../src/utils/metrics/taskMetrics';

const taskProcessTrackingMock: {
  success: () => void;
  failure: (errorType: string) => void;
} = {
  success: () => {},
  failure: (errorType: string) => {},
};

export const taskMetricsMock = {
  trackTaskProcessing: vi.fn().mockReturnValue(taskProcessTrackingMock),
  trackTasksEnqueue: vi.fn().mockReturnValue(void 0),
  resetTrackTasksEnqueue: vi.fn().mockReturnValue(void 0),
} as unknown as Mocked<TaskMetrics>;
