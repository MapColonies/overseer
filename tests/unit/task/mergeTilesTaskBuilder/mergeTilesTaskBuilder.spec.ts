import { randomUUID } from 'crypto';
import nock from 'nock';
import { TileOutputFormat } from '@map-colonies/mc-model-types';
import { multiPartData, partData, partDataWithoutFootPrint } from '../../mocks/jobsMockData';
import { configMock, registerDefaultConfig } from '../../mocks/configMock';
import { MergeTilesTaskBuilder } from '../../../../src/task/models/mergeTilesTaskBuilder';
import { Grid, IMergeTaskParameters, MergeTilesTaskParams } from '../../../../src/common/interfaces';
import { MergeTilesTaskBuilderContext, setupMergeTilesTaskBuilderTest } from './mergeTilesTaskBuilderSetup';

describe('mergeTilesTaskBuilder', () => {
  let testContext: MergeTilesTaskBuilderContext;
  beforeEach(() => {
    registerDefaultConfig();
    testContext = setupMergeTilesTaskBuilderTest();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('buildTasks', () => {
    it('should build tasks successfully for Ingestion New task', async () => {
      const { mergeTilesTaskBuilder } = testContext;
      const buildTasksParams: MergeTilesTaskParams = {
        taskMetadata: { layerRelativePath: 'layerRelativePath', tileOutputFormat: TileOutputFormat.PNG, isNewTarget: true, grid: Grid.TWO_ON_ONE },
        partData: partData,
        inputFiles: { originDirectory: 'originDirectory', fileNames: ['fileNames'] },
      };

      const result = mergeTilesTaskBuilder.buildTasks(buildTasksParams);
      const tasks: IMergeTaskParameters[] = [];

      for await (const task of result) {
        tasks.push(task);
      }

      const samplingTask: IMergeTaskParameters = tasks[0];
      expect(tasks.length).toBeGreaterThan(0);
      expect(samplingTask.isNewTarget).toBe(true);
      expect(samplingTask.targetFormat).toBe(TileOutputFormat.PNG);
      expect(samplingTask.sources.length).toBeGreaterThan(0);
      expect(samplingTask.sources[0].path).toBe('layerRelativePath');
      expect(samplingTask.batches.length).toBeGreaterThan(0);
    });

    it('should handle errors in buildTasks correctly', () => {
      const { mergeTilesTaskBuilder } = testContext;

      jest.spyOn(mergeTilesTaskBuilder as unknown as { createTaskParams: jest.Func }, 'createTaskParams').mockImplementationOnce(() => {
        throw new Error('Mocked error');
      });

      const buildTasksParams: MergeTilesTaskParams = {
        taskMetadata: { layerRelativePath: 'layerRelativePath', tileOutputFormat: TileOutputFormat.PNG, isNewTarget: true, grid: Grid.TWO_ON_ONE },
        partData: partData,
        inputFiles: { originDirectory: 'originDirectory', fileNames: ['fileNames'] },
      };

      let error: Error | null = null;

      try {
        mergeTilesTaskBuilder.buildTasks(buildTasksParams);
      } catch (err) {
        error = err as Error;
      }

      expect(error).not.toBeNull();
    });

    it('should throw an error if polygonPart foot print is missing', () => {
      const { mergeTilesTaskBuilder } = testContext;

      const buildTasksParams: MergeTilesTaskParams = {
        taskMetadata: { layerRelativePath: 'layerRelativePath', tileOutputFormat: TileOutputFormat.PNG, isNewTarget: true, grid: Grid.TWO_ON_ONE },
        partData: partDataWithoutFootPrint,
        inputFiles: { originDirectory: 'originDirectory', fileNames: ['fileNames'] },
      };

      const action = () => mergeTilesTaskBuilder.buildTasks(buildTasksParams);

      expect(action).toThrow();
    });

    it('should continue to the next subGroup if intersecting polygons are not found', async () => {
      const { mergeTilesTaskBuilder } = testContext;
      const buildTasksParams: MergeTilesTaskParams = {
        taskMetadata: { layerRelativePath: 'layerRelativePath', tileOutputFormat: TileOutputFormat.PNG, isNewTarget: true, grid: Grid.TWO_ON_ONE },
        partData: multiPartData,
        inputFiles: { originDirectory: 'originDirectory', fileNames: ['fileNames'] },
      };

      const result = mergeTilesTaskBuilder.buildTasks(buildTasksParams);
      const tasks: IMergeTaskParameters[] = [];

      for await (const task of result) {
        tasks.push(task);
      }

      const samplingTask: IMergeTaskParameters = tasks[0];
      expect(tasks.length).toBeGreaterThan(0);
      expect(samplingTask.isNewTarget).toBe(true);
      expect(samplingTask.targetFormat).toBe(TileOutputFormat.PNG);
      expect(samplingTask.sources.length).toBeGreaterThan(0);
      expect(samplingTask.sources[0].path).toBe('layerRelativePath');
      expect(samplingTask.batches.length).toBeGreaterThan(0);
    });
  });

  describe('pushTasks', () => {
    it('should push tasks in batches correctly', async () => {
      const { mergeTilesTaskBuilder } = testContext;
      const buildTasksParams: MergeTilesTaskParams = {
        taskMetadata: { layerRelativePath: 'layerRelativePath', tileOutputFormat: TileOutputFormat.PNG, isNewTarget: true, grid: Grid.TWO_ON_ONE },
        partData: partData,
        inputFiles: { originDirectory: 'originDirectory', fileNames: ['fileNames'] },
      };

      const jobId = randomUUID();
      const taskId = randomUUID();

      const jobManagerBaseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
      const path = `/jobs/${jobId}/tasks`;
      nock(jobManagerBaseUrl).post(path).reply(200).persist();

      const tasks = mergeTilesTaskBuilder.buildTasks(buildTasksParams);

      let error: Error | null = null;
      try {
        await mergeTilesTaskBuilder.pushTasks(jobId, taskId, tasks);
      } catch (err) {
        error = err as Error;
      }

      expect(error).toBeNull();
    });

    it('should handle errors in pushTasks correctly', async () => {
      const { mergeTilesTaskBuilder } = testContext;
      const buildTasksParams: MergeTilesTaskParams = {
        taskMetadata: { layerRelativePath: 'layerRelativePath', tileOutputFormat: TileOutputFormat.PNG, isNewTarget: true, grid: Grid.TWO_ON_ONE },
        partData: partData,
        inputFiles: { originDirectory: 'originDirectory', fileNames: ['fileNames'] },
      };

      const jobId = randomUUID();
      const taskId = randomUUID();

      const jobManagerBaseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
      const path = `/jobs/${jobId}/tasks`;
      nock(jobManagerBaseUrl).post(path).reply(500).persist();

      const tasks = mergeTilesTaskBuilder.buildTasks(buildTasksParams);

      const action = async () => mergeTilesTaskBuilder.pushTasks(jobId, taskId, tasks);

      await expect(action).rejects.toThrow();
    });
  });
});
