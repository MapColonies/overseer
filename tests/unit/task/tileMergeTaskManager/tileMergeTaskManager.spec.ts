import { randomUUID } from 'crypto';
import nock from 'nock';
import { booleanEqual } from '@turf/turf';
import { faker } from '@faker-js/faker';
import { Feature } from 'geojson';
import { TileOutputFormat } from '@map-colonies/mc-model-types';
import { createFakePartSource, partsData } from '../../mocks/partsMockData';
import { configMock, registerDefaultConfig } from '../../mocks/configMock';
import { ingestionNewJob } from '../../mocks/jobsMockData';
import { Grid, MergeTaskParameters, MergeTilesTaskParams } from '../../../../src/common/interfaces';
import { testData } from '../../mocks/tileMergeTaskManagerMockData';
import { MergeTilesTaskBuilderContext, setupMergeTilesTaskBuilderTest } from './tileMergeTaskManagerSetup';

describe('tileMergeTaskManager', () => {
  let testContext: MergeTilesTaskBuilderContext;
  beforeEach(() => {
    registerDefaultConfig();
    testContext = setupMergeTilesTaskBuilderTest();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('buildTasks', () => {
    it('should build tasks successfully for Ingestion New init task', async () => {
      const { tileMergeTaskManager } = testContext;
      const buildTasksParams: MergeTilesTaskParams = {
        taskMetadata: { layerRelativePath: 'layerRelativePath', tileOutputFormat: TileOutputFormat.PNG, isNewTarget: true, grid: Grid.TWO_ON_ONE },
        partsData,
        inputFiles: { originDirectory: 'originDirectory', fileNames: ['fileNames'] },
      };

      const result = tileMergeTaskManager.buildTasks(buildTasksParams);
      const tasks: MergeTaskParameters[] = [];

      for await (const task of result) {
        tasks.push(task);
      }

      const samplingTask: MergeTaskParameters = tasks[0];
      expect(tasks.length).toBeGreaterThan(0);
      expect(samplingTask.isNewTarget).toBe(true);
      expect(samplingTask.targetFormat).toBe(TileOutputFormat.PNG);
      expect(samplingTask.sources.length).toBeGreaterThan(0);
      expect(samplingTask.sources[0].path).toBe('layerRelativePath');
      expect(samplingTask.batches.length).toBeGreaterThan(0);
    });

    it('should handle errors in buildTasks correctly', () => {
      const { tileMergeTaskManager } = testContext;

      jest.spyOn(tileMergeTaskManager as unknown as { prepareMergeParameters: jest.Func }, 'prepareMergeParameters').mockImplementationOnce(() => {
        throw new Error('Mocked error');
      });

      const buildTasksParams: MergeTilesTaskParams = {
        taskMetadata: { layerRelativePath: 'layerRelativePath', tileOutputFormat: TileOutputFormat.PNG, isNewTarget: true, grid: Grid.TWO_ON_ONE },
        partsData,
        inputFiles: { originDirectory: 'originDirectory', fileNames: ['fileNames'] },
      };

      let error: Error | null = null;

      try {
        tileMergeTaskManager.buildTasks(buildTasksParams);
      } catch (err) {
        error = err as Error;
      }

      expect(error).not.toBeNull();
    });
  });

  describe('unifyParts', () => {
    it('should unify parts correctly', () => {
      const { tileMergeTaskManager } = testContext;
      const partsData = faker.helpers.multiple(createFakePartSource, { count: 10 });
      const result = tileMergeTaskManager['unifyParts'](partsData);

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('calculateIntersectionState', () => {
    // Test case 1: No intersection found
    it('should return null intersection when no overlap is found', () => {
      const { tileMergeTaskManager } = testContext;

      const { input } = testData[0];
      const result = tileMergeTaskManager['calculateIntersectionState'](input.state, input.subGroupFootprints);

      expect(result.currentIntersection).toBeNull();
      expect(result.accumulatedIntersection).toBeNull();
    });

    // Test case 2: Intersection found, no accumulated overlap
    it('should return intersection when found with no previous accumulated overlap', () => {
      const { tileMergeTaskManager } = testContext;
      const { input } = testData[1];

      const result = tileMergeTaskManager['calculateIntersectionState'](input.state, input.subGroupFootprints);
      const isCurrentEqualAccumulated = booleanEqual(result.currentIntersection as Feature, result.accumulatedIntersection as Feature);

      expect(result.currentIntersection).not.toBeNull();
      expect(result.accumulatedIntersection).not.toBeNull();
      expect(isCurrentEqualAccumulated).toBe(true);
    });

    // Test case 3: Intersection found, with accumulated overlap, new intersection
    it('should return new intersection and updated accumulated overlap', () => {
      const { tileMergeTaskManager } = testContext;
      const { input } = testData[2];
      const result = tileMergeTaskManager['calculateIntersectionState'](input.state, input.subGroupFootprints);
      const isCurrentEqualAccumulated = booleanEqual(result.currentIntersection as Feature, result.accumulatedIntersection as Feature);

      expect(result.currentIntersection).not.toBeNull();
      expect(result.accumulatedIntersection).not.toBeNull();
      expect(isCurrentEqualAccumulated).toBe(false);
    });

    // Test case 4: Intersection found, with accumulated overlap, no new intersection
    it('should return null intersection when new intersection is fully within accumulated overlap', () => {
      const { tileMergeTaskManager } = testContext;
      const { input } = testData[2];

      input.state.accumulatedIntersection = {
        type: 'Polygon',
        coordinates: [
          [
            [2, 2],
            [3, 2],
            [3, 3],
            [2, 3],
            [2, 2],
          ],
        ],
      };

      const result = tileMergeTaskManager['calculateIntersectionState'](input.state, input.subGroupFootprints);

      expect(result.currentIntersection).toBeNull();
      expect(result.accumulatedIntersection).not.toBeNull();
    });
  });

  describe('pushTasks', () => {
    it('should push tasks in batches correctly', async () => {
      const { tileMergeTaskManager } = testContext;
      const buildTasksParams: MergeTilesTaskParams = {
        taskMetadata: { layerRelativePath: 'layerRelativePath', tileOutputFormat: TileOutputFormat.PNG, isNewTarget: true, grid: Grid.TWO_ON_ONE },
        partsData,
        inputFiles: { originDirectory: 'originDirectory', fileNames: ['fileNames'] },
      };

      const jobId = randomUUID();

      const jobManagerBaseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
      const path = `/jobs/${jobId}/tasks`;
      nock(jobManagerBaseUrl).post(path).reply(200).persist();

      const tasks = tileMergeTaskManager.buildTasks(buildTasksParams);

      let error: Error | null = null;
      try {
        await tileMergeTaskManager.pushTasks(jobId, ingestionNewJob.type, tasks);
      } catch (err) {
        error = err as Error;
      }

      expect(error).toBeNull();
    });

    it('should handle errors in pushTasks correctly', async () => {
      const { tileMergeTaskManager } = testContext;
      const buildTasksParams: MergeTilesTaskParams = {
        taskMetadata: { layerRelativePath: 'layerRelativePath', tileOutputFormat: TileOutputFormat.PNG, isNewTarget: true, grid: Grid.TWO_ON_ONE },
        partsData,
        inputFiles: { originDirectory: 'originDirectory', fileNames: ['fileNames'] },
      };

      const jobId = randomUUID();

      const jobManagerBaseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
      const path = `/jobs/${jobId}/tasks`;
      nock(jobManagerBaseUrl).post(path).reply(500).persist();

      const tasks = tileMergeTaskManager.buildTasks(buildTasksParams);

      const action = async () => tileMergeTaskManager.pushTasks(jobId, ingestionNewJob.type, tasks);

      await expect(action).rejects.toThrow();
    });
  });
});
