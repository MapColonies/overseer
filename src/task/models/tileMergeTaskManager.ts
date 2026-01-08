import { basename } from 'path';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Span, Tracer } from '@opentelemetry/api';
import { degreesPerPixelToZoomLevel, tileBatchGenerator, TileRanger } from '@map-colonies/mc-utils';
import { bbox, feature } from '@turf/turf';
import { inject, injectable } from 'tsyringe';
import type { Logger } from '@map-colonies/js-logger';
import { type InputFiles } from '@map-colonies/raster-shared';
import type { ICreateTaskBody } from '@map-colonies/mc-priority-queue';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import type { IConfig } from 'config';
import { SERVICES, type StorageProvider } from '../../common/constants';
import { fileExtensionExtractor } from '../../utils/fileUtil';
import { TaskMetrics } from '../../utils/metrics/taskMetrics';
import { createChildSpan } from '../../common/tracing';
import type {
  MergeParameters,
  TaskSources,
  MergeTaskParameters,
  MergeTilesTaskParams,
  TilesSource,
  MergeTilesMetadata,
  JobResumeState,
  ZoomDefinitions,
  FeatureTask,
} from '../../common/interfaces';
import { IngestionCreateTasksTask } from '../../utils/zod/schemas/job.schema';
import { Grid } from '../../common/interfaces';

@injectable()
export class TileMergeTaskManager {
  private readonly tilesStorageProvider: string;
  private readonly tileBatchSize: number;
  private readonly taskBatchSize: number;
  private readonly taskType: string;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.TRACER) private readonly tracer: Tracer,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.TILE_RANGER) private readonly tileRanger: TileRanger,
    @inject(SERVICES.QUEUE_CLIENT) private readonly queueClient: QueueClient,
    private readonly taskMetrics: TaskMetrics
  ) {
    this.tilesStorageProvider = this.config.get<StorageProvider>('tilesStorageProvider');
    this.tileBatchSize = this.config.get<number>('jobManagement.ingestion.tasks.tilesMerging.tileBatchSize');
    this.taskBatchSize = this.config.get<number>('jobManagement.ingestion.tasks.tilesMerging.taskBatchSize');
    this.taskType = this.config.get<string>('jobManagement.ingestion.tasks.tilesMerging.type');
  }

  public buildTasks(
    taskBuildParams: MergeTilesTaskParams,
    initTask: IngestionCreateTasksTask
  ): AsyncGenerator<
    {
      mergeTasksGenerator: MergeTaskParameters;
      latestTaskIndex: JobResumeState;
    },
    void,
    void
  > {
    return context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${TileMergeTaskManager.name}.${this.buildTasks.name}`)), () => {
      const activeSpan = trace.getActiveSpan();
      activeSpan?.setAttributes({
        taskType: this.taskType,
        ...taskBuildParams.taskMetadata,
        ...taskBuildParams.inputFiles,
      });

      const logger = this.logger.child({ taskType: this.taskType });

      logger.debug({ msg: `Building tasks for ${this.taskType} task` });

      try {
        const mergeParams = this.prepareMergeParameters(taskBuildParams);
        activeSpan?.addEvent('Merge parameters prepared');

        const tasks = this.createZoomLevelTasks(mergeParams, activeSpan, initTask);

        logger.debug({ msg: `Successfully built tasks for ${this.taskType} task` });
        return tasks;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const errorMsg = error.message;
        logger.error({ msg: `Failed to build tasks for ${this.taskType} task: ${errorMsg}`, error });
        activeSpan?.setStatus({ code: SpanStatusCode.ERROR, message: errorMsg });
        activeSpan?.recordException(error);
        throw error;
      } finally {
        activeSpan?.end();
      }
    });
  }

  public async pushTasks(
    initTask: IngestionCreateTasksTask,
    jobId: string,
    jobType: string,
    mergeTasks: AsyncGenerator<
      {
        mergeTasksGenerator: MergeTaskParameters;
        latestTaskIndex: JobResumeState;
      },
      void,
      void
    >
  ): Promise<void> {
    await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${TileMergeTaskManager.name}.${this.pushTasks.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();

      activeSpan?.setAttributes({ taskBatchSize: this.taskBatchSize });
      this.taskMetrics.resetTrackTasksEnqueue(jobType, this.taskType);

      const logger = this.logger.child({ jobId, jobType, taskType: this.taskType });
      let taskBatch: ICreateTaskBody<MergeTaskParameters>[] = [];
      let latestTaskIndex: JobResumeState;

      try {
        for await (const task of mergeTasks) {
          latestTaskIndex = task.latestTaskIndex;
          const taskBody: ICreateTaskBody<MergeTaskParameters> = {
            description: 'merge tiles task',
            parameters: task.mergeTasksGenerator,
            type: this.taskType,
          };
          taskBatch.push(taskBody);
          this.taskMetrics.trackTasksEnqueue(jobType, this.taskType, task.mergeTasksGenerator.batches.length);

          if (taskBatch.length === this.taskBatchSize) {
            logger.info({ msg: 'Pushing task batch to queue', batchLength: taskBatch.length });
            activeSpan?.addEvent('enqueueTasks', { currentTaskBatchSize: taskBatch.length });
            await this.enqueueTasks(jobId, taskBatch, initTask, latestTaskIndex);
            taskBatch = [];
          }
        }

        if (taskBatch.length > 0) {
          logger.info({ msg: 'Pushing leftovers task batch to queue', batchLength: taskBatch.length });
          activeSpan?.addEvent('enqueueTasks.leftovers', { currentTaskBatchSize: taskBatch.length });
          await this.enqueueTasks(jobId, taskBatch, initTask, latestTaskIndex!);
          taskBatch = [];
        }
        logger.info({ msg: `Successfully pushed all tasks to queue` });
      } catch (error) {
        if (error instanceof Error) {
          activeSpan?.recordException(error);
          activeSpan?.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        }
        logger.error({ msg: 'Failed to push tasks to queue', error });
        throw error;
      } finally {
        activeSpan?.end();
      }
    });
  }

  private async enqueueTasks(
    jobId: string,
    tasks: ICreateTaskBody<MergeTaskParameters>[],
    initTask: IngestionCreateTasksTask,
    latestTaskIndex: JobResumeState
  ): Promise<void> {
    const logger = this.logger.child({ jobId });
    logger.debug({ msg: `Attempting to enqueue task batch` });

    try {
      await this.queueClient.jobManagerClient.createTaskForJob(jobId, tasks);

      await this.queueClient.jobManagerClient.updateTask(jobId, initTask.id, {
        parameters: {
          ...initTask.parameters,
          latestTaskState: latestTaskIndex,
        },
      });
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
    const { taskMetadata, inputFiles, ingestionResolution, productGeometry } = taskBuildParams;

    logger.info({ msg: 'creating task parameters' });

    const tilesSource = this.extractTilesSource(inputFiles);
    const zoomDefinitions: ZoomDefinitions = {
      maxZoom: degreesPerPixelToZoomLevel(ingestionResolution),
      isMultiResolution: false, // TODO: When multi part resolution support is added, this should be determined accordingly
    };
    const product = feature(productGeometry, {
      tilesSource,
      zoomDefinitions,
    });

    return {
      product,
      taskMetadata,
    };
  }

  private extractTilesSource(inputFiles: InputFiles): TilesSource {
    const { gpkgFilesPath } = inputFiles;
    if (gpkgFilesPath.length > 1) {
      throw new Error('Multiple files ingestion is currently not supported');
    }
    const tilesPath = gpkgFilesPath[0];
    const fileName = basename(tilesPath);

    return {
      fileName,
      tilesPath,
    };
  }

  private async *createZoomLevelTasks(
    params: MergeParameters,
    parentSpan: Span | undefined,
    initTask: IngestionCreateTasksTask
  ): AsyncGenerator<
    {
      mergeTasksGenerator: MergeTaskParameters;
      latestTaskIndex: JobResumeState;
    },
    void,
    void
  > {
    const span = createChildSpan(`${TileMergeTaskManager.name}.${this.createZoomLevelTasks.name}`, parentSpan);

    const { taskMetadata, product } = params;
    const { maxZoom, isMultiResolution } = product.properties.zoomDefinitions;
    const telemetryParams = { taskType: this.taskType, maxZoom, isMultiResolution };
    const logger = this.logger.child(telemetryParams);

    logger.info({ msg: 'Creating tasks for zoom levels' });

    span.setAttributes(telemetryParams);

    // Store original resume state (NEVER changes during loop)
    const resumedFromZoom = initTask.parameters.latestTaskState?.zoomLevel ?? maxZoom;
    const resumeFromTaskIndex = initTask.parameters.latestTaskState?.lastInsertedTaskIndex ?? 0;
    let zoom: number = resumedFromZoom;

    logger.info({
      msg: 'starting task creation on zoom levels',
      runningCurrentZoom: zoom,
      resumedFromZoom,
      resumeFromTaskIndex,
    });

    for (zoom; zoom >= 0; zoom--) {
      logger.info({ msg: 'Processing zoom level', zoom });

      if (isMultiResolution) {
        //TODO:send request to pp-manager and get the footprint of all the parts with the same zoom level.
      }

      // Only skip tasks on the EXACT original resume zoom level
      const shouldSkipTasks = zoom === resumedFromZoom;
      const targetTaskIndex = shouldSkipTasks ? resumeFromTaskIndex : 0;

      logger.debug({
        msg: 'Zoom level task generation',
        zoom,
        latestZoom: resumedFromZoom,
        shouldSkipTasks,
        tasksToSkip: targetTaskIndex,
      });

      yield* this.createTasksForPart(product, zoom, taskMetadata, span, targetTaskIndex);
    }
    span.end();
  }

  private async *createTasksForPart(
    part: FeatureTask,
    zoom: number,
    tilesMetadata: MergeTilesMetadata,
    parentSpan: Span | undefined,
    targetTaskIndex: number = 0
  ): AsyncGenerator<
    {
      mergeTasksGenerator: MergeTaskParameters;
      latestTaskIndex: JobResumeState;
    },
    void,
    void
  > {
    const span = createChildSpan(`${TileMergeTaskManager.name}.${this.createTasksForPart.name}.zoom.${zoom}`, parentSpan);
    span.setAttributes({
      part: JSON.stringify(part),
      zoom,
      maxTileBatchSize: this.tileBatchSize,
      targetTaskIndex,
    });

    const { layerRelativePath, grid, isNewTarget, tileOutputFormat } = tilesMetadata;
    const logger = this.logger.child({
      zoomLevel: zoom,
      isNewTarget,
      layerRelativePath,
      tileOutputFormat,
      grid,
      targetTaskIndex,
    });

    const rangeGenerator = this.tileRanger.encodeFootprint(part, zoom);
    const batches = tileBatchGenerator(this.tileBatchSize, rangeGenerator);
    const sources = this.createPartSources(part, grid, layerRelativePath);

    let taskIndexCounter = 0; // Local counter for this zoom level

    for await (const batch of batches) {
      // Skip tasks if we're resuming and haven't reached the resume point yet
      if (taskIndexCounter < targetTaskIndex) {
        taskIndexCounter++;
        logger.debug({
          msg: 'Skipping batch task due to resume',
          localTaskIndex: taskIndexCounter - 1,
          skipTasksUntilIndex: targetTaskIndex,
          zoomLevel: zoom,
        });
        span.addEvent('Skipping batch task due to resume', {
          skippedTaskIndex: taskIndexCounter - 1,
          skipTasksUntilIndex: targetTaskIndex,
          batchSize: batch.length,
          zoomLevel: zoom,
        });
        continue;
      }

      logger.debug({
        msg: 'Yielding batch task',
        batchSize: batch.length,
        localTaskIndex: taskIndexCounter,
        zoomLevel: zoom,
      });
      span.addEvent('Yielding batch task', {
        batchSize: batch.length,
        localTaskIndex: taskIndexCounter,
        taskIndex: taskIndexCounter,
        zoomLevel: zoom,
        batch: JSON.stringify(batch),
      });

      const mergeTaskParameters: MergeTaskParameters = {
        targetFormat: tileOutputFormat,
        isNewTarget: isNewTarget,
        batches: batch,
        sources,
      };

      taskIndexCounter++;

      const taskResumeState: JobResumeState = {
        lastInsertedTaskIndex: taskIndexCounter,
        zoomLevel: zoom,
      };

      yield {
        mergeTasksGenerator: mergeTaskParameters,
        latestTaskIndex: taskResumeState,
      };
    }
    span.end();
  }

  private createPartSources(part: FeatureTask, grid: Grid, destPath: string): TaskSources[] {
    this.logger.debug({ msg: 'Creating source layers' });

    const sourceEntry: TaskSources = { type: this.tilesStorageProvider, path: destPath };
    const fileExtension = fileExtensionExtractor(part.properties.tilesSource.fileName);
    const extent = bbox(part.geometry);
    const source: TaskSources = {
      type: fileExtension.toUpperCase(),
      path: part.properties.tilesSource.tilesPath,
      grid,
      extent: {
        minX: extent[0],
        minY: extent[1],
        maxX: extent[2],
        maxY: extent[3],
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
