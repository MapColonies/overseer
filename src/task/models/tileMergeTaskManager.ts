import { join } from 'path';
import { BBox } from 'geojson';
import { Logger } from '@map-colonies/js-logger';
import { InputFiles, PolygonPart, TileOutputFormat } from '@map-colonies/mc-model-types';
import { ICreateTaskBody, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { degreesPerPixelToZoomLevel, Footprint, multiIntersect, subGroupsGen, tileBatchGenerator, TileRanger } from '@map-colonies/mc-utils';
import { bbox, featureCollection, union } from '@turf/turf';
import { difference } from '@turf/difference';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../../common/constants';
import {
  Grid,
  IConfig,
  IMergeParameters,
  IMergeSources,
  IMergeTaskParameters,
  MergeTilesTaskParams,
  IPartsIntersection,
  IPartSourceContext,
  IntersectionState,
} from '../../common/interfaces';
import { convertToFeature } from '../../utils/geoUtils';
import { fileExtensionExtractor } from '../../utils/fileutils';

@injectable()
export class TileMergeTaskManager {
  private readonly tilesStorageProvider: string;
  private readonly tileBatchSize: number;
  private readonly taskBatchSize: number;
  private readonly taskType: string;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.TILE_RANGER) private readonly tileRanger: TileRanger,
    @inject(SERVICES.QUEUE_CLIENT) private readonly queueClient: QueueClient
  ) {
    this.tilesStorageProvider = this.config.get<string>('tilesStorageProvider');
    this.tileBatchSize = this.config.get<number>('jobManagement.ingestion.tasks.tilesMerging.tileBatchSize');
    this.taskBatchSize = this.config.get<number>('jobManagement.ingestion.tasks.tilesMerging.taskBatchSize');
    this.taskType = this.config.get<string>('jobManagement.ingestion.tasks.tilesMerging.type');
  }

  public buildTasks(taskBuildParams: MergeTilesTaskParams): AsyncGenerator<IMergeTaskParameters, void, void> {
    const logger = this.logger.child({ taskBuildParams });

    logger.debug({ msg: `Building tasks for ${this.taskType} task` });

    try {
      const mergeParams = this.prepareMergeParameters(taskBuildParams);
      const tasks = this.createZoomLevelTasks(mergeParams);
      logger.debug({ msg: `Successfully built tasks for ${this.taskType} task` });
      return tasks;
    } catch (error) {
      const errorMsg = (error as Error).message;
      logger.error({ msg: `Failed to build tasks for ${this.taskType} task: ${errorMsg}`, error });
      throw error;
    }
  }

  public async pushTasks(jobId: string, tasks: AsyncGenerator<IMergeTaskParameters, void, void>): Promise<void> {
    const logger = this.logger.child({ jobId, taskType: this.taskType });
    let taskBatch: ICreateTaskBody<IMergeTaskParameters>[] = [];

    logger.debug({ msg: `Pushing tasks to queue`, tasks });
    try {
      for await (const task of tasks) {
        const taskBody: ICreateTaskBody<IMergeTaskParameters> = { description: 'merge tiles task', parameters: task, type: this.taskType };
        taskBatch.push(taskBody);

        if (taskBatch.length === this.taskBatchSize) {
          logger.debug({ msg: 'Pushing task batch to queue', batchLength: taskBatch.length, taskBatch });
          await this.enqueueTasks(jobId, taskBatch);
          taskBatch = [];
        }
      }

      if (taskBatch.length > 0) {
        logger.debug({ msg: 'Pushing last task batch to queue', batchLength: taskBatch.length, taskBatch });
        await this.enqueueTasks(jobId, taskBatch);
      }
    } catch (error) {
      logger.error({ msg: 'Failed to push tasks to queue', error });
      throw error;
    }

    logger.info({ msg: `Successfully pushed all tasks to queue` });
  }

  private async enqueueTasks(jobId: string, tasks: ICreateTaskBody<IMergeTaskParameters>[]): Promise<void> {
    const logger = this.logger.child({ jobId });
    logger.debug({ msg: `Attempting to enqueue task batch` });

    try {
      await this.queueClient.jobManagerClient.createTaskForJob(jobId, tasks);
      logger.info({ msg: `Successfully enqueued task batch`, batchLength: tasks.length });
    } catch (error) {
      const errorMsg = (error as Error).message;
      const message = `Failed to enqueue tasks: ${errorMsg}`;
      logger.error({ msg: message, error });
      throw error;
    }
  }

  private prepareMergeParameters(taskBuildParams: MergeTilesTaskParams): IMergeParameters {
    const logger = this.logger.child({ taskType: this.taskType });
    const { taskMetadata, inputFiles, partsData } = taskBuildParams;

    logger.info({ msg: 'creating task parameters' });

    logger.info({ msg: 'creating polygon parts with source context' });
    const parts: IPartSourceContext[] = this.createPartsWithSourceContext(partsData, inputFiles);

    logger.info({ msg: 'calculating max zoom level' });
    const maxZoom = this.calculatePartsMaxZoom(parts);
    logger.info({ msg: 'max zoom level calculated', maxZoom });

    return {
      parts,
      destPath: taskMetadata.layerRelativePath,
      grid: taskMetadata.grid,
      targetFormat: taskMetadata.tileOutputFormat,
      isNewTarget: taskMetadata.isNewTarget,
      maxZoom,
    };
  }

  private createPartsWithSourceContext(parts: PolygonPart[], inputFiles: InputFiles): IPartSourceContext[] {
    return parts.flatMap((part) => this.linkPartToInputFiles(part, inputFiles));
  }

  private linkPartToInputFiles(part: PolygonPart, inputFiles: InputFiles): IPartSourceContext[] {
    this.logger.debug({ msg: 'linking parts to input files', part, inputFiles, numberOfFiles: inputFiles.fileNames.length });
    return inputFiles.fileNames.map<IPartSourceContext>((fileName) => this.linkPartToFile(part, fileName, inputFiles.originDirectory));
  }

  private linkPartToFile(part: PolygonPart, fileName: string, originDirectory: string): IPartSourceContext {
    const logger = this.logger.child({
      partName: part.sourceName,
      fileName,
      originDirectory,
    });

    logger.info({ msg: 'Linking part to input file' });
    const tilesPath = join(originDirectory, fileName);
    const footprint = part.geometry;
    const extent: BBox = bbox(footprint);
    const maxZoom = degreesPerPixelToZoomLevel(part.resolutionDegree);

    return {
      fileName,
      tilesPath,
      footprint,
      extent,
      maxZoom,
    };
  }

  private calculatePartsMaxZoom(parts: IPartSourceContext[]): number {
    this.logger.debug({ msg: 'Calculating max zoom level', parts });
    return Math.max(...parts.map((part) => part.maxZoom));
  }

  private async *createZoomLevelTasks(params: IMergeParameters): AsyncGenerator<IMergeTaskParameters, void, void> {
    const { parts, destPath, targetFormat, isNewTarget, grid, maxZoom } = params;

    this.logger.debug({ msg: 'Creating batched tasks', parts, destPath, targetFormat });
    for (let zoom = maxZoom; zoom >= 0; zoom--) {
      const partsIntersections = this.findPartsIntersections(parts);
      for (const partsIntersection of partsIntersections) {
        yield* this.createTasksForParts(partsIntersection, zoom, { destPath, grid, isNewTarget, targetFormat });
      }
    }
  }

  private async *createTasksForParts(
    partsIntersection: IPartsIntersection,
    zoom: number,
    params: { destPath: string; targetFormat: TileOutputFormat; isNewTarget: boolean; grid: Grid }
  ): AsyncGenerator<IMergeTaskParameters, void, void> {
    const { destPath, grid, isNewTarget, targetFormat } = params;
    const logger = this.logger.child({ zoomLevel: zoom, isNewTarget, destPath, targetFormat, grid });
    const { parts, intersection } = partsIntersection;

    for (const part of parts) {
      if (part.maxZoom < zoom) {
        // checking if the layer is relevant for the current zoom level (allowing different parts with different resolutions)
        continue;
      }

      const footprint = convertToFeature(intersection);
      const rangeGenerator = this.tileRanger.encodeFootprint(footprint, zoom);
      const batches = tileBatchGenerator(this.tileBatchSize, rangeGenerator);
      const sources = this.createPartSources(parts, grid, destPath);

      for await (const batch of batches) {
        logger.debug({ msg: 'Yielding batch task', batchSize: batch.length });
        yield {
          targetFormat,
          isNewTarget: isNewTarget,
          batches: batch,
          sources,
        };
      }
    }
  }

  private createPartSources(parts: IPartSourceContext[], grid: Grid, destPath: string): IMergeSources[] {
    const logger = this.logger.child({ partsLength: parts.length });
    logger.debug({ msg: 'Creating source layers', parts });

    const sourceEntry: IMergeSources = { type: this.tilesStorageProvider, path: destPath };
    const sources = parts.map((part) => {
      const fileExtension = fileExtensionExtractor(part.fileName);
      return {
        type: fileExtension.toUpperCase(),
        path: part.tilesPath,
        grid,
        extent: {
          minX: part.extent[0],
          minY: part.extent[1],
          maxX: part.extent[2],
          maxY: part.extent[3],
        },
      };
    });

    return [sourceEntry, ...sources];
  }

  private *findPartsIntersections(parts: IPartSourceContext[]): Generator<IPartsIntersection> {
    this.logger.debug({ msg: 'Searching for parts intersection', parts });

    //In current implementation we are supporting one file ingestion per layer so we can assume that the layers are not intersect and we can yield them as is
    let state: IntersectionState = { currentIntersection: null, accumulatedIntersection: null };

    const subGroups = subGroupsGen(parts, parts.length);

    for (const subGroup of subGroups) {
      const subGroupFootprints = subGroup.map((layer) => layer.footprint as Footprint);
      this.logger.debug({ msg: 'Processing sub group', subGroup });
      try {
        state = this.calculateIntersectionState(state, subGroupFootprints);
        if (state.currentIntersection) {
          this.logger.debug({ msg: 'Yielding part intersection', subGroup, intersection: state.currentIntersection });
          yield {
            parts: subGroup,
            intersection: state.currentIntersection,
          };
        }
      } catch (error) {
        const errorMsg = (error as Error).message;
        this.logger.error({ msg: `Failed to calculate intersection, error: ${errorMsg}`, error, subGroup });
        throw error;
      }
    }

    this.logger.info({ msg: `Completed finding parts intersection` });
  }

  private calculateIntersectionState(state: IntersectionState, subGroupFootprints: Footprint[]): IntersectionState {
    const logger = this.logger.child({ intersectionState: state, subGroupFootprints });
    logger.debug({ msg: 'Calculating intersection for current subGroup' });

    // Calculate the intersection of all footprints in the subgroup
    const intersection = multiIntersect(subGroupFootprints);
    if (!intersection) {
      // If no intersection is found, return the state with null current intersection
      logger.debug({ msg: 'No intersection found for the current subgroup' });
      return { ...state, currentIntersection: null };
    }

    if (!state.accumulatedIntersection) {
      // If there's no accumulated intersection yet, return the current intersection as both current and accumulated
      logger.debug({ msg: 'No accumulated intersection yet (first iteration), returning current intersection' });
      return {
        currentIntersection: intersection,
        accumulatedIntersection: intersection,
      };
    }

    // Calculate the difference between the current intersection and the accumulated intersection
    const intersectionDifference = this.calculateIntersectionDifference(intersection, state.accumulatedIntersection);
    logger.debug({
      msg: 'new intersection calculated by difference between current intersection and accumulated intersection',
      intersectionDifference,
    });

    if (!intersectionDifference) {
      // If no new intersection is found, return the state with null current intersection
      logger.debug({
        msg: 'no difference found between current intersection and accumulated intersection',
      });
      return { ...state, currentIntersection: null };
    }

    logger.debug({ msg: 'calculating union of accumulated intersection and intersection difference', intersectionDifference });
    //Calculate the union of the accumulated intersection and the new intersection and return the updated state with the new intersection and accumulated intersection
    const newAccumulatedIntersection = this.calculateNewAccumulatedIntersection(state.accumulatedIntersection, intersectionDifference);

    return {
      currentIntersection: intersectionDifference,
      accumulatedIntersection: newAccumulatedIntersection,
    };
  }

  private calculateIntersectionDifference(intersection: Footprint, accumulatedIntersection: Footprint): Footprint | null {
    const differenceFeatureCollection = featureCollection([convertToFeature(intersection), convertToFeature(accumulatedIntersection)]);
    return difference(differenceFeatureCollection);
  }

  private calculateNewAccumulatedIntersection(accumulatedIntersection: Footprint, intersectionDifference: Footprint): Footprint | null {
    const unionFeatureCollection = featureCollection([convertToFeature(accumulatedIntersection), convertToFeature(intersectionDifference)]);
    return union(unionFeatureCollection);
  }
}
