import type { Mocked } from 'vitest';
import type { DependencyContainer } from 'tsyringe';
import { getTestLogger } from '../../../configurations/testLogger';
import { jobHandlerFactory } from '../../../../src/job/models/jobHandlerFactory';
import { SERVICES } from '../../../../src/common/constants';
import { JobHandlerNotFoundError } from '../../../../src/common/errors';

describe('jobHandlerFactory', () => {
  let mockContainer: Mocked<DependencyContainer>;
  const mockJobHandler = vi.fn();

  beforeEach(() => {
    mockContainer = {
      resolve: vi.fn(),
    } as unknown as Mocked<DependencyContainer>;

    mockContainer.resolve.mockImplementation((token) => {
      if (token === SERVICES.LOGGER) {
        return getTestLogger();
      }
      if ('existingJobType' === token) {
        return mockJobHandler;
      }

      return null;
    });
  });

  it('should return a function that returns a job handler', () => {
    const factory = jobHandlerFactory(mockContainer);
    const jobHandler = factory('existingJobType');

    expect(jobHandler).toBe(mockJobHandler);
  });

  it('should throw an error if the job handler is not found', () => {
    const factory = jobHandlerFactory(mockContainer);

    expect(() => factory('nonExistingJobType')).toThrow(JobHandlerNotFoundError);
  });

  it('should throw an error if an error occurs while resolving the job handler', () => {
    mockContainer.resolve.mockImplementation(() => {
      new Error('some error');
    });

    const factory = jobHandlerFactory(mockContainer);

    expect(() => factory('existingJobType')).toThrow(Error);
  });
});
