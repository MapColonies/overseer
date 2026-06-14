import { getTestLogger } from '../../../configurations/testLogger';
import { ExportTaskManager } from '../../../../src/task/models/exportTaskManager';
import { configMock } from '../../mocks/configMock';
import { tracerMock } from '../../mocks/tracerMock';

export interface ExportTaskBuilderContext {
  exportTaskManager: ExportTaskManager;
}

export function setupExportTaskBuilderTest(): ExportTaskBuilderContext {
  const mockLogger = getTestLogger();

  const exportTaskManager = new ExportTaskManager(mockLogger, configMock, tracerMock);

  return {
    exportTaskManager,
  };
}
