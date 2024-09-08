import { randomUUID } from 'crypto';
import nock from 'nock';
import { booleanEqual } from '@turf/turf';
import { Feature } from 'geojson';
import { TileOutputFormat } from '@map-colonies/mc-model-types';
import { partData, partDataWithoutFootPrint } from '../../mocks/partsMockData';
import { configMock, registerDefaultConfig } from '../../mocks/configMock';
import { Grid, IMergeTaskParameters, MergeTilesTaskParams } from '../../../../src/common/interfaces';
import { testData } from '../../mocks/mergeTilesTaskBuilderMockData';
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
    it('should build tasks successfully for Ingestion New init task', async () => {
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
  });

  describe('calculateOverlapState', () => {
    // Test case 1: No intersection found
    it('should return null intersection when no overlap is found', () => {
      const { mergeTilesTaskBuilder } = testContext;

      const { input } = testData[0];
      const result = mergeTilesTaskBuilder['calculateOverlapState'](input.state, input.subGroupFootprints);

      expect(result.currentIntersection).toBeNull();
      expect(result.accumulatedOverlap).toBeNull();
    });

    // Test case 2: Intersection found, no accumulated overlap
    it('should return intersection when found with no previous accumulated overlap', () => {
      const { mergeTilesTaskBuilder } = testContext;
      const { input } = testData[1];

      const result = mergeTilesTaskBuilder['calculateOverlapState'](input.state, input.subGroupFootprints);
      const isCurrentEqualAccumulated = booleanEqual(result.currentIntersection as Feature, result.accumulatedOverlap as Feature);

      expect(result.currentIntersection).not.toBeNull();
      expect(result.accumulatedOverlap).not.toBeNull();
      expect(isCurrentEqualAccumulated).toBe(true);
    });

    // Test case 3: Intersection found, with accumulated overlap, new intersection
    it('should return new intersection and updated accumulated overlap', () => {
      const { mergeTilesTaskBuilder } = testContext;
      const { input } = testData[2];
      const result = mergeTilesTaskBuilder['calculateOverlapState'](input.state, input.subGroupFootprints);
      const isCurrentEqualAccumulated = booleanEqual(result.currentIntersection as Feature, result.accumulatedOverlap as Feature);

      expect(result.currentIntersection).not.toBeNull();
      expect(result.accumulatedOverlap).not.toBeNull();
      expect(isCurrentEqualAccumulated).toBe(false);
    });

    // Test case 4: Intersection found, with accumulated overlap, no new intersection
    it('should return null intersection when new intersection is fully within accumulated overlap', () => {
      const { mergeTilesTaskBuilder } = testContext;
      const { input } = testData[2];

      input.state.accumulatedOverlap = {
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

      const result = mergeTilesTaskBuilder['calculateOverlapState'](input.state, input.subGroupFootprints);

      expect(result.currentIntersection).toBeNull();
      expect(result.accumulatedOverlap).not.toBeNull();
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

        const jobManagerBaseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
        const path = `/jobs/${jobId}/tasks`;
        nock(jobManagerBaseUrl).post(path).reply(200).persist();

        const tasks = mergeTilesTaskBuilder.buildTasks(buildTasksParams);

        let error: Error | null = null;
        try {
          await mergeTilesTaskBuilder.pushTasks(jobId, tasks);
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

        const jobManagerBaseUrl = configMock.get<string>('jobManagement.config.jobManagerBaseUrl');
        const path = `/jobs/${jobId}/tasks`;
        nock(jobManagerBaseUrl).post(path).reply(500).persist();

        const tasks = mergeTilesTaskBuilder.buildTasks(buildTasksParams);

        const action = async () => mergeTilesTaskBuilder.pushTasks(jobId, tasks);

        await expect(action).rejects.toThrow();
      });
    });
  });
});
