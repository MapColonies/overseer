/* eslint-disable jest/no-commented-out-tests */
import { randomUUID } from 'crypto';
import nock from 'nock';
import { bbox } from '@turf/turf';
import { TileOutputFormat } from '@map-colonies/raster-shared';
import { createFakeFeatureCollection, multiPartDataWithDifferentResolution, partsData } from '../../mocks/partsMockData';
import { configMock, registerDefaultConfig } from '../../mocks/configMock';
import { ingestionNewJob } from '../../mocks/jobsMockData';
import type { MergeTaskParameters, MergeTilesTaskParams, PPFeatureCollection } from '../../../../src/common/interfaces';
import { Grid } from '../../../../src/common/interfaces';
import { createMockInitTask } from '../../mocks/tasksMockData';
import { createTaskGenerator, type MergeTilesTaskBuilderContext, setupMergeTilesTaskBuilderTest } from './tileMergeTaskManagerSetup';

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
    const successTestCases: MergeTilesTaskParams[] = [
      {
        taskMetadata: { layerRelativePath: 'layerRelativePath', tileOutputFormat: TileOutputFormat.PNG, isNewTarget: true, grid: Grid.TWO_ON_ONE },
        partsData,
        inputFiles: { originDirectory: 'originDirectory', fileNames: ['unified_zoom_level'] },
      },
      {
        taskMetadata: { layerRelativePath: 'layerRelativePath', tileOutputFormat: TileOutputFormat.PNG, isNewTarget: true, grid: Grid.TWO_ON_ONE },
        partsData: multiPartDataWithDifferentResolution,
        inputFiles: { originDirectory: 'originDirectory', fileNames: ['different_zoom_level'] },
      },
    ];

    test.each(successTestCases)('should build tasks successfully', async (buildTasksParams) => {
      const { tileMergeTaskManager } = testContext;
      const mockInitTask = createMockInitTask();

      const result = tileMergeTaskManager.buildTasks(buildTasksParams, mockInitTask);
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
      const mockInitTask = createMockInitTask();

      const buildTasksParams = {
        taskMetadata: { layerRelativePath: 'layerRelativePath', tileOutputFormat: TileOutputFormat.PNG, isNewTarget: true, grid: Grid.TWO_ON_ONE },
        partsData,
        inputFiles: { originDirectory: 'originDirectory', fileNames: ['file1', 'file2'] },
      };

      let error: Error | null = null;

      try {
        tileMergeTaskManager.buildTasks(buildTasksParams, mockInitTask);
      } catch (err) {
        error = err as Error;
      }

      expect(error).not.toBeNull();
    });
  });

  describe('unifyParts', () => {
    it('should unify parts correctly', () => {
      const { tileMergeTaskManager } = testContext;
      const partsData = createFakeFeatureCollection();
      const result = tileMergeTaskManager['unifyParts'](partsData, { fileName: 'fileName', tilesPath: 'tilesPath' });

      expect(result.extent).toEqual(bbox(result.footprint.geometry));
      expect(result.footprint).not.toBeNull();
    });
  });

  describe('createBufferedFeature', () => {
    it('should return original feature when buffer out of bounds', () => {
      const { tileMergeTaskManager } = testContext;

      const partsData: PPFeatureCollection = {
        features: [
          {
            type: 'Feature',
            properties: {
              maxZoom: 1,
            },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [-180, -90],
                  [-180, 90],
                  [180, 90],
                  [180, -90],
                  [-180, -90],
                ],
              ],
            },
          },
        ],
        type: 'FeatureCollection',
      };

      const result = tileMergeTaskManager['createBufferedFeature'](partsData.features[0]);

      expect(result).toEqual(partsData.features[0]);
    });
  });

  // describe('calculateIntersectionState', () => {
  //   // Test case 1: No intersection found
  //   it('should return null intersection when no overlap is found', () => {
  //     const { tileMergeTaskManager } = testContext;

  //     const { input } = testData[0];
  //     const result = tileMergeTaskManager['calculateIntersectionState'](input.state, input.subGroupFootprints);

  //     expect(result.currentIntersection).toBeNull();
  //     expect(result.accumulatedIntersection).toBeNull();
  //   });

  //   // Test case 2: Intersection found, no accumulated overlap
  //   it('should return intersection when found with no previous accumulated overlap', () => {
  //     const { tileMergeTaskManager } = testContext;
  //     const { input } = testData[1];

  //     const result = tileMergeTaskManager['calculateIntersectionState'](input.state, input.subGroupFootprints);
  //     const isCurrentEqualAccumulated = booleanEqual(result.currentIntersection as Feature, result.accumulatedIntersection as Feature);

  //     expect(result.currentIntersection).not.toBeNull();
  //     expect(result.accumulatedIntersection).not.toBeNull();
  //     expect(isCurrentEqualAccumulated).toBe(true);
  //   });

  //   // Test case 3: Intersection found, with accumulated overlap, new intersection
  //   it('should return new intersection and updated accumulated overlap', () => {
  //     const { tileMergeTaskManager } = testContext;
  //     const { input } = testData[2];
  //     const result = tileMergeTaskManager['calculateIntersectionState'](input.state, input.subGroupFootprints);
  //     const isCurrentEqualAccumulated = booleanEqual(result.currentIntersection as Feature, result.accumulatedIntersection as Feature);

  //     expect(result.currentIntersection).not.toBeNull();
  //     expect(result.accumulatedIntersection).not.toBeNull();
  //     expect(isCurrentEqualAccumulated).toBe(false);
  //   });

  //   // Test case 4: Intersection found, with accumulated overlap, no new intersection
  //   it('should return null intersection when new intersection is fully within accumulated overlap', () => {
  //     const { tileMergeTaskManager } = testContext;
  //     const { input } = testData[2];

  //     input.state.accumulatedIntersection = {
  //       type: 'Polygon',
  //       coordinates: [
  //         [
  //           [2, 2],
  //           [3, 2],
  //           [3, 3],
  //           [2, 3],
  //           [2, 2],
  //         ],
  //       ],
  //     };

  //     const result = tileMergeTaskManager['calculateIntersectionState'](input.state, input.subGroupFootprints);

  //     expect(result.currentIntersection).toBeNull();
  //     expect(result.accumulatedIntersection).not.toBeNull();
  //   });
  // });

  describe('pushTasks', () => {
    it('should push tasks in batches correctly', async () => {
      const { tileMergeTaskManager } = testContext;
      const buildTasksParams: MergeTilesTaskParams = {
        taskMetadata: { layerRelativePath: 'layerRelativePath', tileOutputFormat: TileOutputFormat.PNG, isNewTarget: true, grid: Grid.TWO_ON_ONE },
        partsData,
        inputFiles: { originDirectory: 'originDirectory', fileNames: ['fileNames'] },
      };

      const jobId = randomUUID();
      const mockInitTask = createMockInitTask();

      const jobManagerBaseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
      const path = `/jobs/${jobId}/tasks`;
      const updatePath = `/jobs/${jobId}/tasks/${mockInitTask.id}`;
      nock(jobManagerBaseUrl).post(path).reply(200).persist();
      nock(jobManagerBaseUrl).put(updatePath).reply(200).persist();

      const tasks = tileMergeTaskManager.buildTasks(buildTasksParams, mockInitTask);

      let error: Error | null = null;
      try {
        await tileMergeTaskManager.pushTasks(mockInitTask, jobId, ingestionNewJob.type, tasks);
      } catch (err) {
        error = err as Error;
      }

      expect(error).toBeNull();
    });

    it('should push leftover tasks correctly', async () => {
      const { tileMergeTaskManager } = testContext;
      const taskBatchSize = configMock.get<number>('jobManagement.ingestion.tasks.tilesMerging.taskBatchSize');
      const numberOfTasks = 3;
      const enqueueTasksTotal = Math.ceil(numberOfTasks / taskBatchSize);
      const jobId = randomUUID();
      const mockInitTask = createMockInitTask();

      const jobManagerBaseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
      const path = `/jobs/${jobId}/tasks`;
      const updatePath = `/jobs/${jobId}/tasks/${mockInitTask.id}`;
      nock(jobManagerBaseUrl).post(path).reply(200).persist();
      nock(jobManagerBaseUrl).put(updatePath).reply(200).persist();

      const tasks = createTaskGenerator(numberOfTasks);

      const enqueueTasksSpy = jest.spyOn(tileMergeTaskManager as unknown as { enqueueTasks: jest.Func }, 'enqueueTasks');

      let error: Error | null = null;
      try {
        await tileMergeTaskManager.pushTasks(mockInitTask, jobId, ingestionNewJob.type, tasks);
      } catch (err) {
        error = err as Error;
      }

      expect(error).toBeNull();
      expect(enqueueTasksSpy).toHaveBeenCalledTimes(enqueueTasksTotal);
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

      const mockInitTask = createMockInitTask();
      const tasks = tileMergeTaskManager.buildTasks(buildTasksParams, mockInitTask);

      const action = async () => tileMergeTaskManager.pushTasks(mockInitTask, jobId, ingestionNewJob.type, tasks);

      await expect(action).rejects.toThrow();
    });
  });

  describe('service recovery scenarios', () => {
    it('should update task position from initTask when DB has more recent progress', () => {
      const { tileMergeTaskManager } = testContext;

      // Create initTask with more recent progress
      const mockInitTask = createMockInitTask();
      mockInitTask.parameters.taskIndex = {
        zoomLevel: 5,
        lastInsertedTaskIndex: 10,
      };

      const tasks = [
        {
          description: 'test task',
          parameters: {
            targetFormat: TileOutputFormat.PNG,
            isNewTarget: true,
            batches: [],
            taskIndex: { lastInsertedTaskIndex: 0, zoomLevel: 5 },
            sources: [],
          },
          type: 'merge',
        },
      ];

      // Set local position to be behind
      tileMergeTaskManager['currentTaskPosition'] = { zoomLevel: 5, lastInsertedTaskIndex: 5 };

      const debugSpy = jest.spyOn(tileMergeTaskManager['logger'], 'debug');

      // Call the private method directly
      tileMergeTaskManager['updateLocalTaskIndexing'](tasks, mockInitTask);

      expect(tileMergeTaskManager['currentTaskPosition'].lastInsertedTaskIndex).toBe(11); // 10 + 1 task
      expect(debugSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Updated task position from initTask (service recovery)',
        })
      );
    });

    it('should handle zoom level transition and reset task index', () => {
      const { tileMergeTaskManager } = testContext;

      const mockInitTask = createMockInitTask({
        zoomLevel: 5,
        lastInsertedTaskIndex: 0,
      });

      const tasks = [
        {
          description: 'test task',
          parameters: {
            targetFormat: TileOutputFormat.PNG,
            isNewTarget: true,
            batches: [],
            taskIndex: { lastInsertedTaskIndex: 0, zoomLevel: 4 }, // Different zoom level
            sources: [],
          },
          type: 'merge',
        },
      ];

      // Set local position to different zoom
      tileMergeTaskManager['currentTaskPosition'] = { zoomLevel: 5, lastInsertedTaskIndex: 5 };

      const debugSpy = jest.spyOn(tileMergeTaskManager['logger'], 'debug');

      // Call the private method directly
      tileMergeTaskManager['updateLocalTaskIndexing'](tasks, mockInitTask);

      expect(tileMergeTaskManager['currentTaskPosition'].zoomLevel).toBe(4);
      expect(tileMergeTaskManager['currentTaskPosition'].lastInsertedTaskIndex).toBe(1); // Reset to 0 + 1 task
      expect(debugSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Updated zoom level from task batch',
        })
      );
    });
  });
});
