import { join } from 'path';
import { BBox } from 'geojson';
import { Logger } from '@map-colonies/js-logger';
import { InputFiles, PolygonPart } from '@map-colonies/mc-model-types';
import { ICreateTaskBody, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { degreesPerPixelToZoomLevel, Footprint, multiIntersect, subGroupsGen, tileBatchGenerator, TileRanger } from '@map-colonies/mc-utils';
import { bbox, featureCollection, union } from '@turf/turf';
import { difference } from '@turf/difference';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../../common/constants';
import {
  Grid,
  IConfig,
  IPolygonPartMergeData,
  IMergeOverlaps,
  IMergeParameters,
  IMergeSources,
  IMergeTaskParameters,
  MergeTilesTaskParams,
  OverlapProcessingState,
} from '../../common/interfaces';
import { convertToFeature } from '../../utils/geoUtils';
import { fileExtensionExtractor } from '../../utils/fileutils';
import { LogContext } from '../../common/logging';

@injectable()
export class TileMergeTaskManager {
  private readonly logContext: LogContext;
  private readonly mapServerCacheType: string;
  private readonly tileBatchSize: number;
  private readonly taskBatchSize: number;
  private readonly taskType: string;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.TILE_RANGER) private readonly tileRanger: TileRanger,
    @inject(SERVICES.QUEUE_CLIENT) private readonly queueClient: QueueClient
  ) {
    this.logContext = {
      fileName: __filename,
      class: TileMergeTaskManager.name,
    };
    this.mapServerCacheType = this.config.get<string>('mapServerCacheType');
    this.tileBatchSize = this.config.get<number>('jobManagement.ingestion.tasks.tilesMerging.tileBatchSize');
    this.taskBatchSize = this.config.get<number>('jobManagement.ingestion.tasks.tilesMerging.taskBatchSize');
    this.taskType = this.config.get<string>('jobManagement.ingestion.tasks.tilesMerging.type');
  }

  public buildTasks(taskBuildParams: MergeTilesTaskParams): AsyncGenerator<IMergeTaskParameters, void, void> {
    const logger = this.logger.child({ logContext: { ...this.logContext, function: this.buildTasks.name } });

    logger.debug({ msg: `Building tasks for ${this.taskType} task`, metadata: { taskBuildParams } });

    try {
      const mergeParams = this.createTaskParams(taskBuildParams);
      const mergeTasks = this.createBatchedTasks(mergeParams);
      logger.debug({ msg: `Successfully built tasks for ${this.taskType} task`, metadata: { taskBuildParams } });
      return mergeTasks;
    } catch (error) {
      const errorMsg = (error as Error).message;
      logger.error({ msg: `Failed to build tasks for ${this.taskType} task: ${errorMsg}`, error, metadata: { taskBuildParams } });
      throw error;
    }
  }

  public async pushTasks(jobId: string, tasks: AsyncGenerator<IMergeTaskParameters, void, void>): Promise<void> {
    const logger = this.logger.child({ logContext: { ...this.logContext, function: this.pushTasks.name } });
    let taskBatch: ICreateTaskBody<IMergeTaskParameters>[] = [];

    logger.debug({ msg: `Pushing tasks to queue`, metadata: { jobId, tasks } });
    try {
      for await (const task of tasks) {
        const taskBody: ICreateTaskBody<IMergeTaskParameters> = { description: 'merge tiles task', parameters: task, type: this.taskType };
        taskBatch.push(taskBody);

        if (taskBatch.length === this.taskBatchSize) {
          logger.debug({ msg: 'Pushing task batch to queue', metadata: { jobId, batchLength: taskBatch.length, taskBatch } });
          await this.processTaskBatch(jobId, taskBatch);
          taskBatch = [];
        }
      }

      if (taskBatch.length > 0) {
        logger.debug({ msg: 'Pushing last task batch to queue', metadata: { jobId, batchLength: taskBatch.length, taskBatch } });
        await this.processTaskBatch(jobId, taskBatch);
      }
    } catch (error) {
      this.logger.error({ msg: 'Failed to push tasks to queue', error, metadata: { jobId } });
      throw error;
    }

    this.logger.info({ msg: `Successfully pushed all tasks to queue`, jobId });
  }

  private async processTaskBatch(jobId: string, tasks: ICreateTaskBody<IMergeTaskParameters>[]): Promise<void> {
    //do we need some retry mechanism?
    const logger = this.logger.child({ logContext: { ...this.logContext, function: this.processTaskBatch.name } });
    logger.debug({ msg: `Attempting to push task batch to queue`, metadata: { jobId } });

    try {
      await this.queueClient.jobManagerClient.createTaskForJob(jobId, tasks);
      logger.info({ msg: `Successfully pushed task batch to queue`, metadata: { jobId } });
    } catch (error) {
      const errorMsg = (error as Error).message;
      const message = `Failed to push tasks to queue: ${errorMsg}`;
      logger.error({ msg: message, error, metadata: { jobId } });
      throw error;
    }
  }

  private createPartLayers(partData: PolygonPart, inputFiles: InputFiles): IPolygonPartMergeData[] {
    const logger = this.logger.child({ logContext: { ...this.logContext, function: this.createPartLayers.name } });
    logger.debug({ msg: 'creating part layers', metadata: { partData, inputFiles, numberOfFiles: inputFiles.fileNames.length } });
    return inputFiles.fileNames.map<IPolygonPartMergeData>((fileName) => {
      const tilesPath = join(inputFiles.originDirectory, fileName);
      const footprint = partData.geometry;
      if (!footprint) {
        const errorMsg = 'Part does not have a geometry';
        logger.error({ msg: errorMsg, metadata: { partData } });
        throw new Error(errorMsg);
      }
      const extent: BBox = bbox(footprint);
      const maxZoom = degreesPerPixelToZoomLevel(partData.resolutionDegree ?? 0);
      return {
        fileName,
        tilesPath,
        footprint,
        extent,
        maxZoom,
      };
    });
  }

  private createTaskParams(taskBuildParams: MergeTilesTaskParams): IMergeParameters {
    const logger = this.logger.child({ logContext: { ...this.logContext, function: this.createTaskParams.name } });
    const { taskMetadata, inputFiles, partData } = taskBuildParams;

    logger.debug({ msg: 'Creating task parameters', metadata: { taskMetadata, partData, inputFiles, taskType: this.taskType } });
    const partsLayers: IPolygonPartMergeData[] = [];
    let maxZoom = 0;

    partData.forEach((part: PolygonPart) => {
      const partLayers = this.createPartLayers(part, inputFiles);
      partsLayers.push(...partLayers);
      maxZoom = Math.max(maxZoom, degreesPerPixelToZoomLevel(part.resolutionDegree ?? 0));
    });

    return {
      polygonParts: partsLayers,
      destPath: taskMetadata.layerRelativePath,
      grid: taskMetadata.grid,
      targetFormat: taskMetadata.tileOutputFormat,
      isNewTarget: taskMetadata.isNewTarget,
      maxZoom,
    };
  }

  private async *createBatchedTasks(params: IMergeParameters): AsyncGenerator<IMergeTaskParameters, void, void> {
    const logger = this.logger.child({ logContext: { ...this.logContext, function: this.createBatchedTasks.name } });
    const { polygonParts, destPath, targetFormat, isNewTarget, grid, maxZoom } = params;

    logger.debug({ msg: 'Creating batched tasks', metadata: { polygonParts, destPath, targetFormat } });
    for (let zoom = maxZoom; zoom >= 0; zoom--) {
      const layerOverLaps = this.createLayerOverlaps(polygonParts);

      for (const layerOverlap of layerOverLaps) {
        for (const part of layerOverlap.polygonParts) {
          if (part.maxZoom < zoom) {
            // checking if the layer is relevant for the current zoom level (allowing different parts with different resolutions)
            continue;
          }
          const footprint = convertToFeature(layerOverlap.intersection);
          const rangeGenerator = this.tileRanger.encodeFootprint(footprint, zoom);
          const batches = tileBatchGenerator(this.tileBatchSize, rangeGenerator);

          for await (const batch of batches) {
            logger.debug({ msg: 'Yielding batch task', metadata: { batchSize: batch.length, zoom } });
            yield {
              targetFormat,
              isNewTarget: isNewTarget,
              batches: batch,
              sources: [{ type: this.mapServerCacheType, path: destPath }, ...this.createSourceLayers(layerOverlap, grid)],
            };
          }
        }
      }
    }
  }

  private createSourceLayers(overlap: IMergeOverlaps, grid: Grid): IMergeSources[] {
    const logger = this.logger.child({ logContext: { ...this.logContext, function: this.createSourceLayers.name } });
    logger.debug({ msg: 'Creating source layers', metadata: { overlap } });
    return overlap.polygonParts.map((part) => {
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
  }

  private *createLayerOverlaps(layers: IPolygonPartMergeData[]): Generator<IMergeOverlaps> {
    const logger = this.logger.child({ logContext: { ...this.logContext, function: this.createLayerOverlaps.name } });
    logger.debug({ msg: 'Creating layer overlaps', metadata: { layers } });

    //In current implementation we are supporting one file ingestion per layer so we can assume that the layers are not overlapping and we can yield them as is
    let state: OverlapProcessingState = { currentIntersection: null, accumulatedOverlap: null };

    const subGroups = subGroupsGen(layers, layers.length);

    for (const subGroup of subGroups) {
      const subGroupFootprints = subGroup.map((layer) => layer.footprint as Footprint);
      logger.debug({ msg: 'Processing sub group', metadata: { subGroup } });
      try {
        state = this.calculateOverlapState(state, subGroupFootprints);
        if (state.currentIntersection) {
          logger.debug({ msg: 'Yielding layer overlaps', metadata: { subGroup, intersection: state.currentIntersection } });
          yield {
            polygonParts: subGroup,
            intersection: state.currentIntersection,
          };
        }
      } catch (error) {
        const errorMsg = (error as Error).message;
        this.logger.error({ msg: `Failed to calculate overlaps, error: ${errorMsg}`, error, metadata: { subGroup } });
        throw error;
      }
    }

    logger.info({ msg: `Completed creating layer overlaps` });
  }

  private calculateOverlapState(state: OverlapProcessingState, subGroupFootprints: Footprint[]): OverlapProcessingState {
    const logger = this.logger.child({ logContext: { ...this.logContext, function: this.calculateOverlapState.name } });
    logger.debug({ msg: 'Calculating intersection', metadata: { overlapState: state, subGroupFootprints } });

    // Calculate the intersection of all footprints in the subgroup
    const intersection = multiIntersect(subGroupFootprints);
    if (!intersection) {
      // If no intersection is found, return the state with null current intersection
      logger.debug({ msg: 'No intersection found for the current subgroup', metadata: { overlapState: state, subGroupFootprints } });
      return { ...state, currentIntersection: null };
    }

    if (!state.accumulatedOverlap) {
      // If there's no accumulated overlap yet, return the current intersection as both current and accumulated
      logger.debug({ msg: 'No accumulated overlap found, returning current intersection', metadata: { overlapState: state, subGroupFootprints } });
      return {
        currentIntersection: intersection,
        accumulatedOverlap: intersection,
      };
    }

    const differenceFeatureCollection = featureCollection([convertToFeature(intersection), convertToFeature(state.accumulatedOverlap)]);
    // Calculate the difference between the current intersection and the accumulated overlap
    const intersectionDifference = difference(differenceFeatureCollection);
    logger.debug({
      msg: 'new intersection calculated by difference between current intersection and accumulated overlap',
      metadata: { intersectionDifference },
    });
    if (!intersectionDifference) {
      // If no new intersection is found, return the state with null current intersection
      logger.debug({
        msg: 'no difference found between current intersection and accumulated overlap',
        metadata: { overlapState: state, subGroupFootprints },
      });
      return { ...state, currentIntersection: null };
    }
    const unionFeatureCollection = featureCollection([convertToFeature(state.accumulatedOverlap), convertToFeature(intersectionDifference)]);

    logger.debug({ msg: 'calculating union of accumulated overlap and intersection difference', metadata: { unionFeatureCollection } });

    //Calculate the union of the accumulated overlap and the new intersection and return the updated state with the new intersection and accumulated overlap
    return {
      currentIntersection: intersectionDifference,
      accumulatedOverlap: union(unionFeatureCollection),
    };
  }
}
