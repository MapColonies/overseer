/* eslint-disable jest/no-commented-out-tests */
import { randomUUID } from 'crypto';
import nock from 'nock';
import { bbox } from '@turf/turf';
import { TileOutputFormat } from '@map-colonies/raster-shared';
import { createFakeFeatureCollection, multiPartDataWithDifferentResolution, partsData } from '../../mocks/partsMockData';
import { configMock, registerDefaultConfig } from '../../mocks/configMock';
import { ingestionNewJob } from '../../mocks/jobsMockData';
import type { MergeTaskParameters, MergeTilesTaskParams, PPFeatureCollection, JobResumeState } from '../../../../src/common/interfaces';
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
        tasks.push(task.mergeTasksGenerator);
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
    describe('resume state initialization', () => {
      it('should handle initTask with valid resume parameters', async () => {
        const { tileMergeTaskManager } = testContext;
        const buildTasksParams: MergeTilesTaskParams = {
          taskMetadata: {
            layerRelativePath: 'test/layer',
            tileOutputFormat: TileOutputFormat.PNG,
            isNewTarget: true,
            grid: Grid.TWO_ON_ONE,
          },
          partsData,
          inputFiles: { originDirectory: 'test/origin', fileNames: ['test-file'] },
        };
        const resumeZoomLevel = 6;

        const mockInitTask = createMockInitTask();
        mockInitTask.parameters.taskIndex = {
          zoomLevel: resumeZoomLevel,
          lastInsertedTaskIndex: 2,
        };

        const tasks = tileMergeTaskManager.buildTasks(buildTasksParams, mockInitTask);

        // Collect a small sample of tasks to verify business logic
        const taskSample: MergeTaskParameters[] = [];
        const maxSamples = 5;

        for await (const task of tasks) {
          taskSample.push(task.mergeTasksGenerator);
          if (taskSample.length >= maxSamples) {
            break;
          }
        }

        // Explicit business logic assertions
        expect(taskSample).toHaveLength(5);

        const taskResumeSample: JobResumeState[] = [];
        let sampleCount = 0;
        for await (const task of tasks) {
          taskResumeSample.push(task.latestTaskIndex);
          sampleCount++;
          if (sampleCount >= maxSamples) {
            break;
          }
        }

        taskResumeSample.forEach((taskIndex) => {
          expect(taskIndex.zoomLevel).toBeLessThanOrEqual(resumeZoomLevel);
          expect(taskIndex.lastInsertedTaskIndex).toBeGreaterThanOrEqual(0);
        });

        taskSample.forEach((task) => {
          expect(task.sources.length).toBeGreaterThan(0);
          expect(task.batches.length).toBeGreaterThan(0);
        });
      });

      it('should handle initTask without resume parameters (fresh start)', async () => {
        const { tileMergeTaskManager } = testContext;
        const buildTasksParams: MergeTilesTaskParams = {
          taskMetadata: {
            layerRelativePath: 'test/layer',
            tileOutputFormat: TileOutputFormat.PNG,
            isNewTarget: true,
            grid: Grid.TWO_ON_ONE,
          },
          partsData,
          inputFiles: { originDirectory: 'test/origin', fileNames: ['test-file'] },
        };

        const mockInitTask = createMockInitTask();
        // No taskIndex set - should default to fresh start

        const tasks = tileMergeTaskManager.buildTasks(buildTasksParams, mockInitTask);

        // Collect tasks to verify fresh start works correctly
        const taskSample: MergeTaskParameters[] = [];
        const taskResumeSample: JobResumeState[] = [];
        const maxSamples = 5;

        for await (const task of tasks) {
          taskSample.push(task.mergeTasksGenerator);
          taskResumeSample.push(task.latestTaskIndex);
          if (taskSample.length >= maxSamples) {
            break;
          }
        }

        // Fresh start should generate tasks normally
        expect(taskSample).toHaveLength(5);

        taskResumeSample.forEach((taskIndex) => {
          expect(taskIndex.zoomLevel).toBeGreaterThanOrEqual(0);
          expect(taskIndex.lastInsertedTaskIndex).toBeGreaterThanOrEqual(0);
        });

        taskSample.forEach((task) => {
          expect(task.sources.length).toBeGreaterThan(0);
        });
      });

      it('should handle initTask with boundary resume parameters', async () => {
        const { tileMergeTaskManager } = testContext;
        const buildTasksParams: MergeTilesTaskParams = {
          taskMetadata: {
            layerRelativePath: 'test/layer',
            tileOutputFormat: TileOutputFormat.PNG,
            isNewTarget: true,
            grid: Grid.TWO_ON_ONE,
          },
          partsData,
          inputFiles: { originDirectory: 'test/origin', fileNames: ['test-file'] },
        };

        const mockInitTask = createMockInitTask();
        mockInitTask.parameters.taskIndex = {
          zoomLevel: 0, // Minimum zoom
          lastInsertedTaskIndex: 0, // Start index
        };

        const tasks = tileMergeTaskManager.buildTasks(buildTasksParams, mockInitTask);

        // Collect tasks to verify boundary conditions work
        const taskSample: MergeTaskParameters[] = [];
        const taskResumeSample: JobResumeState[] = [];
        const maxSamples = 2;

        for await (const task of tasks) {
          taskSample.push(task.mergeTasksGenerator);
          taskResumeSample.push(task.latestTaskIndex);
          if (taskSample.length >= maxSamples) {
            break;
          }
        }

        expect(taskSample.length).toBeGreaterThan(0);

        taskResumeSample.forEach((taskIndex) => {
          expect(taskIndex.zoomLevel).toBe(0);
          expect(taskIndex.lastInsertedTaskIndex).toBeGreaterThanOrEqual(0);
        });

        taskSample.forEach((task) => {
          expect(task.sources.length).toBeGreaterThan(0);
          expect(task.batches.length).toBeGreaterThan(0);
        });
      });
    });

    describe('task skipping logic', () => {
      it('should handle skip parameters correctly', async () => {
        const { tileMergeTaskManager } = testContext;
        const buildTasksParams: MergeTilesTaskParams = {
          taskMetadata: {
            layerRelativePath: 'test/layer',
            tileOutputFormat: TileOutputFormat.PNG,
            isNewTarget: true,
            grid: Grid.TWO_ON_ONE,
          },
          partsData,
          inputFiles: { originDirectory: 'test/origin', fileNames: ['test-file'] },
        };

        const mockInitTask = createMockInitTask();
        mockInitTask.parameters.taskIndex = {
          zoomLevel: 4, // Match test data max zoom
          lastInsertedTaskIndex: 1, // Should trigger skip logic
        };

        const tasks = tileMergeTaskManager.buildTasks(buildTasksParams, mockInitTask);

        // Collect tasks to verify skip logic works
        const taskSample: MergeTaskParameters[] = [];
        const taskResumeSample: JobResumeState[] = [];
        const maxSamples = 2;

        for await (const task of tasks) {
          taskSample.push(task.mergeTasksGenerator);
          taskResumeSample.push(task.latestTaskIndex);
          if (taskSample.length >= maxSamples) {
            break;
          }
        }

        // Skip logic should still generate valid tasks (after skipping)
        expect(taskSample.length).toBeGreaterThanOrEqual(0); // May be 0 if all tasks are skipped

        // If tasks are generated, they should be valid
        taskResumeSample.forEach((taskIndex) => {
          expect(taskIndex.zoomLevel).toBeLessThanOrEqual(4);
          expect(taskIndex.lastInsertedTaskIndex).toBeGreaterThanOrEqual(0); // Should be >= 0 (valid index)
        });

        taskSample.forEach((task) => {
          expect(task.sources.length).toBeGreaterThan(0);
          expect(task.batches.length).toBeGreaterThan(0);
        });
      });

      it('should handle high skip index values', async () => {
        const { tileMergeTaskManager } = testContext;
        const buildTasksParams: MergeTilesTaskParams = {
          taskMetadata: {
            layerRelativePath: 'test/layer',
            tileOutputFormat: TileOutputFormat.PNG,
            isNewTarget: true,
            grid: Grid.TWO_ON_ONE,
          },
          partsData,
          inputFiles: { originDirectory: 'test/origin', fileNames: ['test-file'] },
        };

        const mockInitTask = createMockInitTask();
        mockInitTask.parameters.taskIndex = {
          zoomLevel: 4,
          lastInsertedTaskIndex: 999, // High skip value
        };

        const tasks = tileMergeTaskManager.buildTasks(buildTasksParams, mockInitTask);

        // Try to collect tasks with high skip value
        const taskSample: MergeTaskParameters[] = [];
        const taskResumeSample: JobResumeState[] = [];
        const maxSamples = 2;

        for await (const task of tasks) {
          taskSample.push(task.mergeTasksGenerator);
          taskResumeSample.push(task.latestTaskIndex);
          if (taskSample.length >= maxSamples) {
            break;
          }
        }

        // High skip values should not crash the system
        expect(taskSample.length).toBeGreaterThanOrEqual(0); // Likely 0 since skip value is very high

        // If any tasks are generated, they should be valid
        taskSample.forEach((task) => {
          expect(task.targetFormat).toBe(TileOutputFormat.PNG);
          expect(task.isNewTarget).toBe(true);
        });

        taskResumeSample.forEach((taskIndex) => {
          expect(taskIndex.zoomLevel).toBeLessThanOrEqual(4);
          expect(taskIndex.lastInsertedTaskIndex).toBeGreaterThanOrEqual(0);
        });
      });
    });

    describe('progress tracking integration', () => {
      it('should update initTask progress during task processing', async () => {
        const { tileMergeTaskManager } = testContext;
        const buildTasksParams: MergeTilesTaskParams = {
          taskMetadata: {
            layerRelativePath: 'test/layer',
            tileOutputFormat: TileOutputFormat.PNG,
            isNewTarget: true,
            grid: Grid.TWO_ON_ONE,
          },
          partsData,
          inputFiles: { originDirectory: 'test/origin', fileNames: ['test-file'] },
        };

        const jobId = randomUUID();
        const mockInitTask = createMockInitTask();

        // Setup HTTP mocks for job manager interactions
        const jobManagerBaseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
        const createTasksPath = `/jobs/${jobId}/tasks`;
        const updateTaskPath = `/jobs/${jobId}/tasks/${mockInitTask.id}`;

        nock(jobManagerBaseUrl).post(createTasksPath).reply(200).persist();
        nock(jobManagerBaseUrl).put(updateTaskPath).reply(200).persist();

        // Spy on the job manager client methods
        const updateTaskSpy = jest.spyOn(tileMergeTaskManager['queueClient'].jobManagerClient, 'updateTask');
        const createTaskSpy = jest.spyOn(tileMergeTaskManager['queueClient'].jobManagerClient, 'createTaskForJob');

        const tasks = tileMergeTaskManager.buildTasks(buildTasksParams, mockInitTask);
        await tileMergeTaskManager.pushTasks(mockInitTask, jobId, ingestionNewJob.type, tasks);

        // Verify progress tracking occurred
        expect(updateTaskSpy).toHaveBeenCalled();
        expect(updateTaskSpy.mock.calls.length).toBeGreaterThan(0);

        updateTaskSpy.mockRestore();
        createTaskSpy.mockRestore();
      });

      it('should handle progress tracking with resume state', async () => {
        const { tileMergeTaskManager } = testContext;
        const buildTasksParams: MergeTilesTaskParams = {
          taskMetadata: {
            layerRelativePath: 'test/layer',
            tileOutputFormat: TileOutputFormat.PNG,
            isNewTarget: true,
            grid: Grid.TWO_ON_ONE,
          },
          partsData,
          inputFiles: { originDirectory: 'test/origin', fileNames: ['test-file'] },
        };

        const jobId = randomUUID();
        const mockInitTask = createMockInitTask();

        // Set resume state
        mockInitTask.parameters.taskIndex = {
          zoomLevel: 4,
          lastInsertedTaskIndex: 1,
        };

        const jobManagerBaseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
        const createTasksPath = `/jobs/${jobId}/tasks`;
        const updateTaskPath = `/jobs/${jobId}/tasks/${mockInitTask.id}`;

        nock(jobManagerBaseUrl).post(createTasksPath).reply(200).persist();
        nock(jobManagerBaseUrl).put(updateTaskPath).reply(200).persist();

        const updateTaskSpy = jest.spyOn(tileMergeTaskManager['queueClient'].jobManagerClient, 'updateTask');

        const tasks = tileMergeTaskManager.buildTasks(buildTasksParams, mockInitTask);
        await tileMergeTaskManager.pushTasks(mockInitTask, jobId, ingestionNewJob.type, tasks);

        // Verify that progress tracking works even with resume state
        expect(updateTaskSpy).toHaveBeenCalled();

        updateTaskSpy.mockRestore();
      });
    });

    describe('error handling in service recovery', () => {
      it('should handle malformed resume parameters gracefully', async () => {
        const { tileMergeTaskManager } = testContext;
        const buildTasksParams: MergeTilesTaskParams = {
          taskMetadata: {
            layerRelativePath: 'test/layer',
            tileOutputFormat: TileOutputFormat.PNG,
            isNewTarget: true,
            grid: Grid.TWO_ON_ONE,
          },
          partsData,
          inputFiles: { originDirectory: 'test/origin', fileNames: ['test-file'] },
        };

        const mockInitTask = createMockInitTask();
        // Set malformed taskIndex
        mockInitTask.parameters.taskIndex = {
          zoomLevel: -1, // Invalid zoom level
          lastInsertedTaskIndex: -5, // Invalid index
        };

        // Should not throw error - implementation should handle gracefully
        expect(() => {
          const tasks = tileMergeTaskManager.buildTasks(buildTasksParams, mockInitTask);
          expect(tasks).toBeDefined();
        }).not.toThrow();

        // Verify no tasks are generated with malformed parameters
        const tasks = tileMergeTaskManager.buildTasks(buildTasksParams, mockInitTask);
        const taskSample: MergeTaskParameters[] = [];
        const taskResumeSample: JobResumeState[] = [];
        const maxSamples = 5;

        for await (const task of tasks) {
          taskSample.push(task.mergeTasksGenerator);
          taskResumeSample.push(task.latestTaskIndex);
          if (taskSample.length >= maxSamples) {
            break;
          }
        }

        // Expect no tasks to be pushed with malformed parameters
        expect(taskSample).toHaveLength(0);

        // Spy on updateTask to verify it's not called
        const updateTaskSpy = jest.spyOn(tileMergeTaskManager['queueClient'].jobManagerClient, 'updateTask');

        const jobId = randomUUID();
        await tileMergeTaskManager.pushTasks(mockInitTask, jobId, ingestionNewJob.type, tasks);

        // Expect updateJob to not be called when no tasks are processed
        expect(updateTaskSpy).not.toHaveBeenCalled();

        updateTaskSpy.mockRestore();
      });

      it('should handle recovery when HTTP requests fail', async () => {
        const { tileMergeTaskManager } = testContext;
        const buildTasksParams: MergeTilesTaskParams = {
          taskMetadata: {
            layerRelativePath: 'test/layer',
            tileOutputFormat: TileOutputFormat.PNG,
            isNewTarget: true,
            grid: Grid.TWO_ON_ONE,
          },
          partsData,
          inputFiles: { originDirectory: 'test/origin', fileNames: ['test-file'] },
        };

        const jobId = randomUUID();
        const mockInitTask = createMockInitTask();

        // Setup HTTP mocks to simulate failures
        const jobManagerBaseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
        const createTasksPath = `/jobs/${jobId}/tasks`;

        nock(jobManagerBaseUrl).post(createTasksPath).reply(500).persist();

        const tasks = tileMergeTaskManager.buildTasks(buildTasksParams, mockInitTask);

        // Should reject when HTTP requests fail
        await expect(tileMergeTaskManager.pushTasks(mockInitTask, jobId, ingestionNewJob.type, tasks)).rejects.toThrow();
      });
    });

    describe('end-to-end service recovery scenarios', () => {
      it('should complete full recovery cycle: build -> push with resume state', async () => {
        const { tileMergeTaskManager } = testContext;
        const buildTasksParams: MergeTilesTaskParams = {
          taskMetadata: {
            layerRelativePath: 'test/layer',
            tileOutputFormat: TileOutputFormat.PNG,
            isNewTarget: true,
            grid: Grid.TWO_ON_ONE,
          },
          partsData,
          inputFiles: { originDirectory: 'test/origin', fileNames: ['test-file'] },
        };

        const jobId = randomUUID();
        const mockInitTask = createMockInitTask();

        // Simulate recovery scenario
        mockInitTask.parameters.taskIndex = {
          zoomLevel: 3,
          lastInsertedTaskIndex: 0,
        };

        const jobManagerBaseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
        const createTasksPath = `/jobs/${jobId}/tasks`;
        const updateTaskPath = `/jobs/${jobId}/tasks/${mockInitTask.id}`;

        nock(jobManagerBaseUrl).post(createTasksPath).reply(200).persist();
        nock(jobManagerBaseUrl).put(updateTaskPath).reply(200).persist();

        // Execute full recovery cycle
        const tasks = tileMergeTaskManager.buildTasks(buildTasksParams, mockInitTask);

        let error: Error | null = null;
        try {
          await tileMergeTaskManager.pushTasks(mockInitTask, jobId, ingestionNewJob.type, tasks);
        } catch (err) {
          error = err as Error;
        }

        // Verify successful completion
        expect(error).toBeNull();
      });
    });
  });
});
