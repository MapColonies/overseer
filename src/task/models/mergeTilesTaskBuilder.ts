import { join } from 'path';
import { BBox } from 'geojson';
import { Logger } from '@map-colonies/js-logger';
import { InputFiles, PolygonPart } from '@map-colonies/mc-model-types';
import { ICreateTaskBody, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { degreesPerPixelToZoomLevel, Footprint, multiIntersect, subGroupsGen, tileBatchGenerator, TileRanger } from '@map-colonies/mc-utils';
import { bbox, featureCollection, intersect } from '@turf/turf';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../../common/constants';
import {
  Grid,
  IConfig,
  ILayerMergeData,
  IMergeOverlaps,
  IMergeParameters,
  IMergeSources,
  IMergeTaskParameters,
  LogContext,
  MergeTilesTaskParams,
} from '../../common/interfaces';
import { convertToFeature } from '../../utils/geoUtils';
import { fileExtensionExtractor } from '../../utils/fileutils';

@injectable()
export class MergeTilesTaskBuilder {
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
      class: MergeTilesTaskBuilder.name,
    };
    this.mapServerCacheType = this.config.get<string>('mapServerCacheType');
    this.tileBatchSize = this.config.get<number>('jobManagement.ingestion.tasks.tilesMerging.tileBatchSize');
    this.taskBatchSize = this.config.get<number>('jobManagement.ingestion.tasks.tilesMerging.taskBatchSize');
    this.taskType = this.config.get<string>('jobManagement.ingestion.tasks.tilesMerging.type');
  }

  public buildTasks(newLayer: MergeTilesTaskParams): AsyncGenerator<IMergeTaskParameters, void, void> {
    const logger = this.logger.child({ logContext: { ...this.logContext, function: this.buildTasks.name } });

    logger.debug({ msg: `Building tasks for ${this.taskType} task`, metadata: { newLayer } });

    try {
      const mergeParams = this.createTaskParams(newLayer);
      const mergeTasks = this.createBatchedTasks(mergeParams);
      logger.debug({ msg: `Successfully built tasks for ${this.taskType} task`, metadata: { newLayer } });
      return mergeTasks;
    } catch (error) {
      const errorMessage = (error as Error).message;
      logger.error({ msg: `Failed to build tasks for ${this.taskType} task: ${errorMessage}`, error, metadata: { newLayer } });
      throw error;
    }
  }

  public async pushTasks(jobId: string, pollingTaskId: string, tasks: AsyncGenerator<IMergeTaskParameters, void, void>): Promise<void> {
    const logger = this.logger.child({ logContext: { ...this.logContext, function: this.pushTasks.name } });
    let taskBatch: ICreateTaskBody<IMergeTaskParameters>[] = [];

    logger.info({ msg: `Pushing tasks to queue`, metadata: { jobId } });
    try {
      for await (const task of tasks) {
        const taskBody: ICreateTaskBody<IMergeTaskParameters> = { description: 'merge tiles task', parameters: task, type: this.taskType };
        taskBatch.push(taskBody);

        if (taskBatch.length === this.taskBatchSize) {
          logger.debug({ msg: 'Pushing task batch to queue', metadata: { jobId, batchLength: taskBatch.length, taskBatch } });
          await this.processTaskBatch(jobId, pollingTaskId, taskBatch);
          taskBatch = [];
        }
      }

      if (taskBatch.length > 0) {
        logger.debug({ msg: 'Pushing last task batch to queue', metadata: { jobId, batchLength: taskBatch.length, taskBatch } });
        await this.processTaskBatch(jobId, pollingTaskId, taskBatch);
      }
    } catch (error) {
      this.logger.error({ msg: 'Failed to push tasks to queue', error, metadata: { jobId } });
      throw error;
    }

    this.logger.info({ msg: `Successfully pushed all tasks to queue`, jobId });
  }

  private async processTaskBatch(jobId: string, taskId: string, tasks: ICreateTaskBody<IMergeTaskParameters>[]): Promise<void> {
    //do we need some retry mechanism?
    const logger = this.logger.child({ logContext: { ...this.logContext, function: this.processTaskBatch.name } });
    logger.debug({ msg: `Attempting to push task batch to queue`, metadata: { jobId } });

    try {
      await this.queueClient.jobManagerClient.createTaskForJob(jobId, tasks);
      logger.info({ msg: `Successfully pushed task batch to queue`, metadata: { jobId } });
    } catch (error) {
      const errorMessage = (error as Error).message;
      const message = `Failed to push tasks to queue: ${errorMessage}`;
      logger.error({ msg: message, error, metadata: { jobId } });
      throw error;
    }
  }

  private createPartLayers(partData: PolygonPart, inputFiles: InputFiles): ILayerMergeData[] {
    const logger = this.logger.child({ logContext: { ...this.logContext, function: this.createPartLayers.name } });
    logger.debug({ msg: 'creating part layers', metadata: { partData, inputFiles, numberOfFiles: inputFiles.fileNames.length } });
    return inputFiles.fileNames.map<ILayerMergeData>((fileName) => {
      const filePath = join(inputFiles.originDirectory, fileName);
      const footprint = partData.geometry;
      if (!footprint) {
        logger.error({ msg: 'Part does not have a geometry', metadata: { partData } });
        throw new Error('Part does not have a geometry');
      }
      const extent: BBox = bbox(footprint);
      return {
        fileName,
        tilesPath: filePath,
        footprint,
        extent,
      };
    });
  }

  private createTaskParams(newLayer: MergeTilesTaskParams): IMergeParameters {
    const logger = this.logger.child({ logContext: { ...this.logContext, function: this.createTaskParams.name } });
    const { taskMetadata, inputFiles, partData } = newLayer;

    logger.debug({ msg: 'Creating task parameters', metadata: { taskMetadata, partData, inputFiles, taskType: this.taskType } });
    const partsLayers: ILayerMergeData[] = [];
    let maxZoom = 0;

    partData.forEach((part: PolygonPart) => {
      const partLayers = this.createPartLayers(part, inputFiles);
      partsLayers.push(...partLayers);

      const currentZoom = degreesPerPixelToZoomLevel(part.resolutionDegree ?? 0);
      maxZoom = Math.max(maxZoom, currentZoom);
    });

    logger.debug({ msg: `Calculated max zoom level`, metadata: { maxZoom } });

    return {
      layers: partsLayers,
      maxZoom,
      destPath: taskMetadata.layerRelativePath,
      grid: taskMetadata.grid,
      targetFormat: taskMetadata.tileOutputFormat,
      isNewTarget: taskMetadata.isNewTarget,
    };
  }

  private async *createBatchedTasks(params: IMergeParameters): AsyncGenerator<IMergeTaskParameters, void, void> {
    const logger = this.logger.child({ logContext: { ...this.logContext, function: this.createBatchedTasks.name } });
    const { layers, destPath, maxZoom, targetFormat, isNewTarget, grid } = params;

    logger.debug({ msg: 'Creating batched tasks', metadata: { layers, destPath, maxZoom, targetFormat } });

    for (let zoom = maxZoom; zoom >= 0; zoom--) {
      const layerOverLaps = this.createLayerOverlaps(layers);

      for (const layerOverlap of layerOverLaps) {
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

  private createSourceLayers(overlap: IMergeOverlaps, grid: Grid): IMergeSources[] {
    const logger = this.logger.child({ logContext: { ...this.logContext, function: this.createSourceLayers.name } });
    logger.debug({ msg: 'Creating source layers', metadata: { overlap } });
    return overlap.layers.map((layer) => {
      const fileExtension = fileExtensionExtractor(layer.fileName);
      return {
        type: fileExtension.toUpperCase(),
        path: layer.tilesPath,
        grid,
        extent: {
          minX: layer.extent[0],
          minY: layer.extent[1],
          maxX: layer.extent[2],
          maxY: layer.extent[3],
        },
      };
    });
  }

  private *createLayerOverlaps(layers: ILayerMergeData[]): Generator<IMergeOverlaps> {
    const logger = this.logger.child({ logContext: { ...this.logContext, function: this.createLayerOverlaps.name } });
    logger.info({ msg: 'Creating layer overlaps', metadata: { layers } });

    let totalIntersection: Footprint | undefined = undefined;
    const subGroups = subGroupsGen(layers, layers.length);

    for (const subGroup of subGroups) {
      const subGroupFootprints = subGroup.map((layer) => layer.footprint as Footprint);
      logger.debug({ msg: 'Processing sub group', metadata: { subGroup } });
      try {
        const intersection = this.calculateIntersection(totalIntersection, subGroupFootprints);
        if (intersection === null) {
          continue;
        }

        totalIntersection = intersection;

        logger.debug({ msg: 'Yielding layer overlaps', metadata: { subGroup, intersection } });
        yield {
          layers: subGroup,
          intersection,
        };
      } catch (error) {
        const errorMessage = (error as Error).message;
        this.logger.error({ msg: `Failed to calculate overlaps, error: ${errorMessage}`, error, metadata: { subGroup } });
        throw error;
      }
    }

    logger.info({ msg: `Completed creating layer overlaps` });
  }

  private calculateIntersection(totalIntersection: Footprint | undefined, subGroupFootprints: Footprint[]): Footprint | null {
    const logger = this.logger.child({ logContext: { ...this.logContext, function: this.calculateIntersection.name } });
    logger.debug({ msg: 'Calculating intersection', metadata: { totalIntersection, subGroupFootprints } });

    let intersection = multiIntersect(subGroupFootprints);
    if (intersection === null) {
      logger.debug({ msg: 'No intersection found for the current subgroup', metadata: { subGroupFootprints } });
      return null;
    }

    if (totalIntersection !== undefined) {
      const featureCollectionToIntersect = featureCollection([convertToFeature(totalIntersection), convertToFeature(intersection)]);
      logger.debug({
        msg: 'Calculating intersection between totalIntersection and current intersection',
        metadata: { totalIntersection, intersection },
      });
      intersection = intersect(featureCollectionToIntersect);
    }
    logger.debug({ msg: 'Intersection calculation completed', metadata: { intersection } });

    return intersection;
  }
}
