/* eslint-disable @typescript-eslint/naming-convention */
import { MissingConfigError } from '../../../src/common/errors';
import { IngestionPollingJobs } from '../../../src/common/interfaces';
import { validateAndGetHandlersTokens } from '../../../src/utils/configUtil';
import { registerDefaultConfig } from '../mocks/configMock';

describe('configUtil', () => {
  beforeEach(() => {
    registerDefaultConfig();
  });

  describe('validateAndGetHandlersTokens', () => {
    it('should return the polling job types if they are found in the config', () => {
      const ingestionConfig: IngestionPollingJobs = {
        new: { type: 'Ingestion_New' },
        update: { type: 'Ingestion_Update' },
        swapUpdate: { type: 'Ingestion_Swap_Update' },
      };

      const result = validateAndGetHandlersTokens(ingestionConfig);

      expect(result).toEqual({
        Ingestion_New: ingestionConfig.new?.type,
        Ingestion_Update: ingestionConfig.update?.type,
        Ingestion_Swap_Update: ingestionConfig.swapUpdate?.type,
      });
    });

    it('should throw an error if one of the "new" job type is not found in the config', () => {
      const ingestionConfig = {
        update: { type: 'Ingestion_Update', tasks: {} },
        swapUpdate: { type: 'Ingestion_Swap_Update', tasks: {} },
      } as unknown as IngestionPollingJobs;

      const action = () => validateAndGetHandlersTokens(ingestionConfig);

      expect(action).toThrow(MissingConfigError);
    });

    it('should throw an error if one of the "update" job type is not found in the config', () => {
      const ingestionConfig = {
        new: { type: 'Ingestion_New', tasks: {} },
        swapUpdate: { type: 'Ingestion_Swap_Update', tasks: {} },
      } as unknown as IngestionPollingJobs;

      const action = () => validateAndGetHandlersTokens(ingestionConfig);

      expect(action).toThrow(MissingConfigError);
    });

    it('should throw an error if one of the "swap update" job type is not found in the config', () => {
      const ingestionConfig = {
        new: { type: 'Ingestion_New', tasks: {} },
        update: { type: 'Ingestion_Update', tasks: {} },
      } as unknown as IngestionPollingJobs;

      const action = () => validateAndGetHandlersTokens(ingestionConfig);

      expect(action).toThrow(MissingConfigError);
    });

    it('should throw an error if one of the  job types is empty', () => {
      const ingestionConfig = {
        new: { type: '', tasks: {} },
        update: { type: 'Ingestion_Update', tasks: {} },
        swapUpdate: { type: 'Ingestion_Swap_Update', tasks: {} },
      } as unknown as IngestionPollingJobs;

      const action = () => validateAndGetHandlersTokens(ingestionConfig);

      expect(action).toThrow(MissingConfigError);
    });
  });
});
