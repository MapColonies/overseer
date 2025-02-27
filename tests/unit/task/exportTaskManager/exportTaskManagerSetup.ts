import jsLogger from '@map-colonies/js-logger';
import { ExportTaskManager } from '../../../../src/task/models/exportTaskManager';
import { configMock } from '../../mocks/configMock';
import { tracerMock } from '../../mocks/tracerMock';

export interface ExportTaskBuilderContext {
  exportTaskManager: ExportTaskManager;
}

export function setupExportTaskBuilderTest(): ExportTaskBuilderContext {
  const mockLogger = jsLogger({ enabled: false });

  const exportTaskManager = new ExportTaskManager(mockLogger, configMock, tracerMock);

  return {
    exportTaskManager,
  };
}
