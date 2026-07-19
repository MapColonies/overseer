/* eslint-disable @typescript-eslint/naming-convention */
import { MissingConfigError } from '../../../src/common/errors';
import type { PollingJobs, PollingTasks } from '../../../src/common/interfaces';
import { getPollingTaskTypes, validateAndGetHandlersTokens } from '../../../src/utils/configUtil';
import { registerDefaultConfig } from '../mocks/configMock';

const pollingTasks: PollingTasks = {
  createTasks: 'create-tasks',
  init: 'init',
  finalize: 'finalize',
  delete: 'delete',
};

describe('configUtil', () => {
  beforeEach(() => {
    registerDefaultConfig();
  });

  describe('validateAndGetHandlersTokens', () => {
    describe('instance type is ingestion', () => {
      const instanceType = 'ingestion';

      it('should return the polling job types if they are found in the config', () => {
        const ingestionConfig: PollingJobs = {
          new: { type: 'Ingestion_New' },
          update: { type: 'Ingestion_Update' },
          swapUpdate: { type: 'Ingestion_Swap_Update' },
          deleteLayer: { type: 'Delete_Layer' },
        };

        const result = validateAndGetHandlersTokens(ingestionConfig, instanceType);

        expect(result).toEqual({
          Ingestion_New: ingestionConfig.new?.type,
          Ingestion_Update: ingestionConfig.update?.type,
          Ingestion_Swap_Update: ingestionConfig.swapUpdate?.type,
          Delete_Layer: ingestionConfig.deleteLayer?.type,
        });
      });

      it('should throw an error if the "delete layer" job type is not found in the config', () => {
        const ingestionConfig = {
          new: { type: 'Ingestion_New' },
          update: { type: 'Ingestion_Update' },
          swapUpdate: { type: 'Ingestion_Swap_Update' },
        } as unknown as PollingJobs;

        const action = () => validateAndGetHandlersTokens(ingestionConfig, instanceType);

        expect(action).toThrow(MissingConfigError);
      });

      it('should throw an error if one of the "new" job type is not found in the config', () => {
        const ingestionConfig = {
          update: { type: 'Ingestion_Update' },
          swapUpdate: { type: 'Ingestion_Swap_Update' },
        } as unknown as PollingJobs;

        const action = () => validateAndGetHandlersTokens(ingestionConfig, instanceType);

        expect(action).toThrow(MissingConfigError);
      });

      it('should throw an error if one of the "update" job type is not found in the config', () => {
        const ingestionConfig = {
          new: { type: 'Ingestion_New' },
          swapUpdate: { type: 'Ingestion_Swap_Update' },
        } as unknown as PollingJobs;

        const action = () => validateAndGetHandlersTokens(ingestionConfig, instanceType);

        expect(action).toThrow(MissingConfigError);
      });

      it('should throw an error if one of the "swap update" job type is not found in the config', () => {
        const ingestionConfig = {
          new: { type: 'Ingestion_New' },
          update: { type: 'Ingestion_Update' },
        } as unknown as PollingJobs;

        const action = () => validateAndGetHandlersTokens(ingestionConfig, instanceType);

        expect(action).toThrow(MissingConfigError);
      });

      it('should throw an error if one of the job types is empty', () => {
        const ingestionConfig = {
          new: { type: '' },
          update: { type: 'Ingestion_Update' },
          swapUpdate: { type: 'Ingestion_Swap_Update' },
        } as unknown as PollingJobs;

        const action = () => validateAndGetHandlersTokens(ingestionConfig, instanceType);

        expect(action).toThrow(MissingConfigError);
      });
    });

    describe('instance type is export', () => {
      const instanceType = 'export';

      it('should return the polling job types if they are found in the config', () => {
        const ingestionConfig: PollingJobs = {
          export: { type: 'Export' },
        };

        const result = validateAndGetHandlersTokens(ingestionConfig, instanceType);

        expect(result).toEqual({
          Export: ingestionConfig.export?.type,
        });
      });

      it('should throw an error if "export" job type is not found in the config', () => {
        const ingestionConfig = {} as unknown as PollingJobs;

        const action = () => validateAndGetHandlersTokens(ingestionConfig, instanceType);

        expect(action).toThrow(MissingConfigError);
      });

      it('should throw an error if "export" job type is empty', () => {
        const ingestionConfig = {
          export: { type: '' },
        } as unknown as PollingJobs;

        const action = () => validateAndGetHandlersTokens(ingestionConfig, instanceType);

        expect(action).toThrow(MissingConfigError);
      });
    });
  });

  describe('getPollingTaskTypes', () => {
    it('should return create, init, finalize and delete task types for the ingestion domain', () => {
      const result = getPollingTaskTypes(pollingTasks, 'ingestion');

      expect(result).toEqual([pollingTasks.createTasks, pollingTasks.init, pollingTasks.finalize, pollingTasks.delete]);
    });

    it('should return create, init and finalize task types (without delete) for the export domain', () => {
      const result = getPollingTaskTypes(pollingTasks, 'export');

      expect(result).toEqual([pollingTasks.createTasks, pollingTasks.init, pollingTasks.finalize]);
      expect(result).not.toContain(pollingTasks.delete);
    });
  });
});
