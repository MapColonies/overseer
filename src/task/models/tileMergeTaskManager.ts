import { join } from 'path';
import { Logger } from '@map-colonies/js-logger';
import { Feature, MultiPolygon, Polygon } from 'geojson';
import { InputFiles, PolygonPart } from '@map-colonies/mc-model-types';
import { ICreateTaskBody, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { degreesPerPixelToZoomLevel, tileBatchGenerator, TileRanger } from '@map-colonies/mc-utils';
import { bbox, buffer, featureCollection, polygon, union, Units } from '@turf/turf';
import { inject, injectable } from 'tsyringe';
import { SERVICES, TilesStorageProvider } from '../../common/constants';
import {
  Grid,
  IConfig,
  MergeParameters,
  MergeSources,
  MergeTaskParameters,
  MergeTilesTaskParams,
  PolygonFeature,
  FeatureCollectionWitZoomDefinitions,
  UnifiedPart,
  TilesSource,
  MergeTilesMetadata,
  PPFeatureCollection,
} from '../../common/interfaces';
import { fileExtensionExtractor } from '../../utils/fileutils';
import { TaskMetrics } from '../../utils/metrics/taskMetrics';

@injectable()
export class TileMergeTaskManager {
  private readonly tilesStorageProvider: string;
  private readonly tileBatchSize: number;
  private readonly taskBatchSize: number;
  private readonly taskType: string;
  private readonly radiusBuffer: number;
  private readonly radiusBufferUnits: Units;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.TILE_RANGER) private readonly tileRanger: TileRanger,
    @inject(SERVICES.QUEUE_CLIENT) private readonly queueClient: QueueClient,
    private readonly taskMetrics: TaskMetrics
  ) {
    this.tilesStorageProvider = this.config.get<TilesStorageProvider>('tilesStorageProvider');
    this.tileBatchSize = this.config.get<number>('jobManagement.ingestion.tasks.tilesMerging.tileBatchSize');
    this.taskBatchSize = this.config.get<number>('jobManagement.ingestion.tasks.tilesMerging.taskBatchSize');
    this.taskType = this.config.get<string>('jobManagement.ingestion.tasks.tilesMerging.type');
    this.radiusBuffer = this.config.get<number>('jobManagement.ingestion.tasks.tilesMerging.radiusBuffer');
    this.radiusBufferUnits = this.config.get<Units>('jobManagement.ingestion.tasks.tilesMerging.radiusBufferUnits');
  }

  public buildTasks(taskBuildParams: MergeTilesTaskParams): AsyncGenerator<MergeTaskParameters, void, void> {
    const logger = this.logger.child({ taskType: this.taskType });

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

  public async pushTasks(jobId: string, jobType: string, tasks: AsyncGenerator<MergeTaskParameters, void, void>): Promise<void> {
    this.taskMetrics.resetTrackTasksEnqueue(jobType, this.taskType);

    const logger = this.logger.child({ jobId, jobType, taskType: this.taskType });
    let taskBatch: ICreateTaskBody<MergeTaskParameters>[] = [];

    try {
      for await (const task of tasks) {
        const taskBody: ICreateTaskBody<MergeTaskParameters> = { description: 'merge tiles task', parameters: task, type: this.taskType };
        taskBatch.push(taskBody);
        this.taskMetrics.trackTasksEnqueue(jobType, this.taskType, task.batches.length);

        if (taskBatch.length === this.taskBatchSize) {
          logger.info({ msg: 'Pushing task batch to queue', batchLength: taskBatch.length });
          await this.enqueueTasks(jobId, taskBatch);
          taskBatch = [];
        }
      }

      if (taskBatch.length > 0) {
        logger.info({ msg: 'Pushing last task batch to queue', batchLength: taskBatch.length });
        await this.enqueueTasks(jobId, taskBatch);
      }
    } catch (error) {
      logger.error({ msg: 'Failed to push tasks to queue', error });
      throw error;
    }

    logger.info({ msg: `Successfully pushed all tasks to queue` });
  }

  private async enqueueTasks(jobId: string, tasks: ICreateTaskBody<MergeTaskParameters>[]): Promise<void> {
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

  private prepareMergeParameters(taskBuildParams: MergeTilesTaskParams): MergeParameters {
    const logger = this.logger.child({ taskType: this.taskType });
    const { taskMetadata, inputFiles, partsData } = taskBuildParams;

    logger.info({ msg: 'creating task parameters' });

    const { ppCollection, zoomDefinitions } = this.createFeatureCollectionWithZoomDefinitions(partsData);
    const tilesSource = this.extractTilesSource(inputFiles);

    return {
      ppCollection,
      zoomDefinitions,
      taskMetadata,
      tilesSource,
    };
  }

  private extractTilesSource(inputFiles: InputFiles): TilesSource {
    const { originDirectory, fileNames } = inputFiles;
    if (fileNames.length > 1) {
      throw new Error('Multiple files ingestion is currently not supported');
    }
    const fileName = fileNames[0];
    const tilesPath = join(originDirectory, fileName);

    return {
      fileName,
      tilesPath,
    };
  }

  private createFeatureCollectionWithZoomDefinitions(parts: PolygonPart[]): FeatureCollectionWitZoomDefinitions {
    this.logger.info({
      msg: 'Generating featureParts',
      numberOfParts: parts.length,
    });

    let partsMaxZoom = 0;

    const featureParts = parts.map((part) => {
      const featurePart = this.createFeaturePolygon(part);
      const currentZoom = featurePart.properties.maxZoom;

      partsMaxZoom = Math.max(partsMaxZoom, currentZoom);
      return featurePart;
    });

    const partsZoomLevelMatch = featureParts.every((part) => part.properties.maxZoom === partsMaxZoom);

    const zoomDefinitions = {
      maxZoom: partsMaxZoom,
      partsZoomLevelMatch,
    };

    this.logger.info({
      msg: 'Calculated parts zoom definitions',
      partsMaxZoom,
      partsZoomLevelMatch,
    });

    return {
      ppCollection: featureCollection(featureParts),
      zoomDefinitions,
    };
  }

  private createFeaturePolygon(part: PolygonPart): PolygonFeature {
    const logger = this.logger.child({
      partName: part.sourceName,
    });

    const maxZoom = degreesPerPixelToZoomLevel(part.resolutionDegree);
    logger.debug({ msg: `Part max zoom: ${maxZoom}` });
    const featurePolygon = polygon(part.footprint.coordinates, { maxZoom });

    return featurePolygon;
  }

  private async *createZoomLevelTasks(params: MergeParameters): AsyncGenerator<MergeTaskParameters, void, void> {
    const { ppCollection, taskMetadata, zoomDefinitions, tilesSource } = params;
    const { maxZoom, partsZoomLevelMatch } = zoomDefinitions;
    const logger = this.logger.child({ taskType: this.taskType, maxZoom, partsZoomLevelMatch });

    let unifiedPart: UnifiedPart | null = partsZoomLevelMatch ? this.unifyParts(ppCollection, tilesSource) : null;
    logger.info({ msg: 'Creating tasks for zoom levels' });

    for (let zoom = maxZoom; zoom >= 0; zoom--) {
      logger.info({ msg: 'Processing zoom level', zoom });
      if (!partsZoomLevelMatch) {
        const filteredFeatures = ppCollection.features.filter((feature) => feature.properties.maxZoom >= zoom);
        const collection = featureCollection(filteredFeatures);
        unifiedPart = this.unifyParts(collection, tilesSource);
      }

      yield* this.createTasksForPart(unifiedPart!, zoom, taskMetadata);
    }
  }

  private unifyParts(featureCollection: PPFeatureCollection, tilesSource: TilesSource): UnifiedPart {
    const { fileName, tilesPath } = tilesSource;
    const isOnePart = featureCollection.features.length === 1;

    if (isOnePart) {
      const featurePart = featureCollection.features[0];
      return {
        fileName: fileName,
        tilesPath: tilesPath,
        footprint: featurePart,
        extent: bbox(featurePart),
      };
    }

    const mergedFootprint = union(featureCollection);

    if (mergedFootprint === null) {
      throw new Error('Failed to merge parts because the union result is null');
    }
    const bufferedFeature = this.createBufferedFeature(mergedFootprint);

    return {
      fileName: fileName,
      tilesPath: tilesPath,
      footprint: bufferedFeature,
      extent: bbox(bufferedFeature),
    };
  }

  //strip out all gaps and holes in the polygon which simplifies the polygon(solved the issue with tileRanger intersect error)
  private createBufferedFeature(feature: Feature<Polygon | MultiPolygon>): Feature<Polygon | MultiPolygon> {
    const logger = this.logger.child({ featureType: feature.type, radiusBuffer: this.radiusBuffer });

    const bufferOutFeature = buffer(feature.geometry, this.radiusBuffer, { units: this.radiusBufferUnits });

    if (bufferOutFeature === undefined) {
      const errorMsg = 'Failed to buffer Out feature because the result is undefined';
      logger.error({ errorMsg });
      throw new Error(errorMsg);
    }

    const bufferInFeature = buffer(bufferOutFeature.geometry, -this.radiusBuffer, { units: this.radiusBufferUnits });

    if (bufferInFeature === undefined) {
      const errorMsg = 'Failed to buffer In feature because the result is undefined';
      logger.error({ errorMsg });
      throw new Error(errorMsg);
    }

    logger.debug({ msg: 'Successfully created buffered feature' });
    return bufferInFeature;
  }

  private async *createTasksForPart(
    part: UnifiedPart,
    zoom: number,
    tilesMetadata: MergeTilesMetadata
  ): AsyncGenerator<MergeTaskParameters, void, void> {
    const { layerRelativePath, grid, isNewTarget, tileOutputFormat } = tilesMetadata;
    const logger = this.logger.child({ zoomLevel: zoom, isNewTarget, layerRelativePath, tileOutputFormat, grid });

    const footprint = part.footprint;
    const rangeGenerator = this.tileRanger.encodeFootprint(footprint, zoom);
    const batches = tileBatchGenerator(this.tileBatchSize, rangeGenerator);
    const sources = this.createPartSources(part, grid, layerRelativePath);

    for await (const batch of batches) {
      logger.debug({ msg: 'Yielding batch task', batchSize: batch.length });
      yield {
        targetFormat: tileOutputFormat,
        isNewTarget: isNewTarget,
        batches: batch,
        sources,
      };
    }
  }

  private createPartSources(part: UnifiedPart, grid: Grid, destPath: string): MergeSources[] {
    this.logger.debug({ msg: 'Creating source layers' });

    const sourceEntry: MergeSources = { type: this.tilesStorageProvider, path: destPath };
    const fileExtension = fileExtensionExtractor(part.fileName);

    const source: MergeSources = {
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

    return [sourceEntry, source];
  }

  /**
   * @futureUse This function may be needed for upcoming features(two or more ingestion sources).
   */
  /* istanbul ignore next */
  // private *findPartsIntersections(parts: PartSourceContext[]): Generator<PartsIntersection, void, void> {
  //   this.logger.debug({ msg: 'Searching for parts intersection' });

  //   //In current implementation we are supporting one file ingestion per layer so we can assume that the layers are not intersect and we can yield them as is
  //   let state: IntersectionState = { currentIntersection: null, accumulatedIntersection: null };

  //   const subGroups = subGroupsGen(parts, parts.length, false);
  //   for (const subGroup of subGroups) {
  //     const subGroupFootprints = subGroup.map((layer) => layer.footprint as Footprint);
  //     this.logger.debug({ msg: 'Processing sub group' });
  //     try {
  //       state = this.calculateIntersectionState(state, subGroupFootprints);
  //       if (state.currentIntersection) {
  //         this.logger.debug({ msg: 'Yielding part intersection', intersection: state.currentIntersection });
  //         yield {
  //           parts: subGroup,
  //           intersection: state.currentIntersection,
  //         };
  //       }
  //       yield {
  //         parts: subGroup,
  //         intersection: null,
  //       };
  //     } catch (error) {
  //       const errorMsg = (error as Error).message;
  //       this.logger.error({ msg: `Failed to calculate intersection, error: ${errorMsg}`, error });
  //       throw error;
  //     }
  //   }

  //   this.logger.info({ msg: `Completed finding parts intersection` });
  // }

  // private calculateIntersectionState(state: IntersectionState, subGroupFootprints: Footprint[]): IntersectionState {
  //   const logger = this.logger.child({ intersectionState: state });
  //   logger.debug({ msg: 'Calculating intersection for current subGroup' });

  //   // Calculate the intersection of all footprints in the subgroup
  //   const intersection = multiIntersect(subGroupFootprints);
  //   if (!intersection) {
  //     // If no intersection is found, return the state with null current intersection
  //     logger.debug({ msg: 'No intersection found for the current subgroup' });
  //     return { ...state, currentIntersection: null };
  //   }

  //   if (!state.accumulatedIntersection) {
  //     // If there's no accumulated intersection yet, return the current intersection as both current and accumulated
  //     logger.debug({ msg: 'No accumulated intersection yet (first iteration), returning current intersection' });
  //     return {
  //       currentIntersection: intersection,
  //       accumulatedIntersection: intersection,
  //     };
  //   }

  //   // Calculate the difference between the current intersection and the accumulated intersection
  //   const intersectionDifference = this.calculateIntersectionDifference(intersection, state.accumulatedIntersection);
  //   logger.debug({
  //     msg: 'new intersection calculated by difference between current intersection and accumulated intersection',
  //     intersectionDifference,
  //   });

  //   if (!intersectionDifference) {
  //     // If no new intersection is found, return the state with null current intersection
  //     logger.debug({
  //       msg: 'no difference found between current intersection and accumulated intersection',
  //     });
  //     return { ...state, currentIntersection: null };
  //   }

  //   logger.debug({ msg: 'calculating union of accumulated intersection and intersection difference', intersectionDifference });
  //   //Calculate the union of the accumulated intersection and the new intersection and return the updated state with the new intersection and accumulated intersection
  //   const newAccumulatedIntersection = this.calculateNewAccumulatedIntersection(state.accumulatedIntersection, intersectionDifference);

  //   return {
  //     currentIntersection: intersectionDifference,
  //     accumulatedIntersection: newAccumulatedIntersection,
  //   };
  // }

  // private calculateIntersectionDifference(intersection: Footprint, accumulatedIntersection: Footprint): Footprint | null {
  //   const differenceFeatureCollection = featureCollection([convertToFeature(intersection), convertToFeature(accumulatedIntersection)]);
  //   return difference(differenceFeatureCollection);
  // }

  // private calculateNewAccumulatedIntersection(accumulatedIntersection: Footprint, intersectionDifference: Footprint): Footprint | null {
  //   const unionFeatureCollection = featureCollection([convertToFeature(accumulatedIntersection), convertToFeature(intersectionDifference)]);
  //   return union(unionFeatureCollection);
  // }
}
