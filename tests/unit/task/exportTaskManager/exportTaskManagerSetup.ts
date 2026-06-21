import { getTestLogger } from '../../../configurations/testLogger';
import { ExportTaskManager } from '../../../../src/task/models/exportTaskManager';
import { configMock } from '../../mocks/configMock';
import { tracerMock } from '../../mocks/tracerMock';

export interface ExportTaskBuilderContext {
  exportTaskManager: ExportTaskManager;
}

export async function setupExportTaskBuilderTest(): Promise<ExportTaskBuilderContext> {
  const mockLogger = await getTestLogger();

  const exportTaskManager = new ExportTaskManager(mockLogger, configMock, tracerMock);

  return {
    exportTaskManager,
  };
}
