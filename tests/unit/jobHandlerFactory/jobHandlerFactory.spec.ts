import jsLogger from '@map-colonies/js-logger';
import { DependencyContainer } from 'tsyringe';
import { jobHandlerFactory } from '../../../src/models/jobHandlerFactory';
import { SERVICES } from '../../../src/common/constants';
import { JobHandlerNotFoundError } from '../../../src/common/errors';

describe('jobHandlerFactory', () => {
  let mockContainer: jest.Mocked<DependencyContainer>;
  const mockJobHandler = jest.fn();

  beforeEach(() => {
    mockContainer = {
      resolve: jest.fn(),
    } as unknown as jest.Mocked<DependencyContainer>;

    mockContainer.resolve.mockImplementation((token) => {
      if (token === SERVICES.LOGGER) {
        return jsLogger({ enabled: false });
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
});
