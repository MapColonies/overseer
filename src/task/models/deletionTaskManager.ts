import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Span, Tracer } from '@opentelemetry/api';
import { degreesPerPixelToZoomLevel, tileBatchGenerator, TileRanger, zoomLevelToResolutionDeg } from '@map-colonies/mc-utils';
import { feature as turfFeature, featureCollection as turfFeatureCollection, union } from '@turf/turf';
import { inject, injectable } from 'tsyringe';
import type { Logger } from '@map-colonies/js-logger';
import { ShapefileChunkReader } from '@map-colonies/shapefile-reader';
import type { IntersectionFeatureCollection, IngestionValidationTaskParams, TilesDeletionParams } from '@map-colonies/raster-shared';
import type { ICreateTaskBody, ITaskResponse } from '@map-colonies/mc-priority-queue';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import type { IConfig } from 'config';
import type { MultiPolygon, Polygon } from 'geojson';
import { NotFoundError, UnprocessableEntityError } from '@map-colonies/error-types';
import { SERVICES, StorageProvider } from '../../common/constants';
import type { BuildDeletionTaskParams } from '../../common/interfaces';
import { TaskMetrics } from '../../utils/metrics/taskMetrics';
import { createChildSpan } from '../../common/tracing';
import { IngestionCreateTasksTask, IngestionUpdateCreateTasksJob } from '../../utils/zod/schemas/job.schema';
import { PolygonPartsMangerClient } from '../../httpClients/polygonPartsMangerClient';
import { readConflictFeatures } from '../../utils/report';

@injectable()
export class TileDeletionTaskManager {
  private readonly tileBatchSize: number;
  private readonly taskBatchSize: number;
  private readonly taskType: string;
  private readonly sourceProvider: StorageProvider;
  private readonly shapefileReader: ShapefileChunkReader;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.TRACER) private readonly tracer: Tracer,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.QUEUE_CLIENT) private readonly queueClient: QueueClient,
    @inject(SERVICES.TILE_RANGER) private readonly tileRanger: TileRanger,
    @inject(PolygonPartsMangerClient) private readonly polygonPartsMangerClient: PolygonPartsMangerClient,
    private readonly taskMetrics: TaskMetrics
  ) {
    this.tileBatchSize = this.config.get<number>('jobManagement.ingestion.tasks.tilesDeletion.tileBatchSize');
    this.taskBatchSize = this.config.get<number>('jobManagement.ingestion.tasks.tilesDeletion.taskBatchSize');
    this.taskType = this.config.get<string>('jobManagement.ingestion.tasks.tilesDeletion.type');
    this.sourceProvider = this.config.get<StorageProvider>('tilesStorageProvider');
    this.shapefileReader = new ShapefileChunkReader({
      maxVerticesPerChunk: this.config.get<number>('shapefileReader.maxVerticesPerChunk'),
    });
  }

  public buildTasks(
    initTask: IngestionCreateTasksTask,
    taskBuildParams: BuildDeletionTaskParams
  ): AsyncGenerator<ICreateTaskBody<TilesDeletionParams>, void, void> {
    return context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${TileDeletionTaskManager.name}.${this.buildTasks.name}`)), () => {
      const activeSpan = trace.getActiveSpan();
      return this.buildDeletionTasksGenerator(initTask, taskBuildParams, activeSpan);
    });
  }

  public async pushTasks(
    jobId: string,
    jobType: string,
    deletionTasks: AsyncGenerator<ICreateTaskBody<TilesDeletionParams>, void, void>
  ): Promise<void> {
    await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${TileDeletionTaskManager.name}.${this.pushTasks.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();
      const logger = this.logger.child({ jobId, jobType, taskType: this.taskType });

      this.taskMetrics.resetTrackTasksEnqueue(jobType, this.taskType);
      let taskBatch: ICreateTaskBody<TilesDeletionParams>[] = [];

      try {
        for await (const task of deletionTasks) {
          taskBatch.push(task);
          this.taskMetrics.trackTasksEnqueue(jobType, this.taskType, task.parameters.ranges.length);

          if (taskBatch.length === this.taskBatchSize) {
            logger.info({ msg: 'Pushing deletion task batch to queue', batchLength: taskBatch.length });
            activeSpan?.addEvent('enqueueDeletionTasks', { currentTaskBatchSize: taskBatch.length });
            await this.queueClient.jobManagerClient.createTaskForJob(jobId, taskBatch);
            taskBatch = [];
          }
        }

        if (taskBatch.length > 0) {
          logger.info({ msg: 'Pushing leftover deletion task batch to queue', batchLength: taskBatch.length });
          activeSpan?.addEvent('enqueueDeletionTasks.leftovers', { currentTaskBatchSize: taskBatch.length });
          await this.queueClient.jobManagerClient.createTaskForJob(jobId, taskBatch);
          taskBatch = [];
        }

        logger.info({ msg: 'Successfully pushed all deletion tasks to queue' });
      } catch (error) {
        if (error instanceof Error) {
          activeSpan?.recordException(error);
          activeSpan?.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        }
        logger.error({ msg: 'Failed to push deletion tasks to queue', error });
        throw error;
      } finally {
        activeSpan?.end();
      }
    });
  }

  public async buildAndPushTasks(
    job: IngestionUpdateCreateTasksJob,
    task: IngestionCreateTasksTask,
    polygonPartsEntityName: string,
    layerRelativePath: string
  ): Promise<void> {
    const logger = this.logger.child({ jobId: job.id, jobType: job.type });
    const { additionalParams } = job.parameters;

    const validationTask = await this.fetchValidationTask(job.id);
    try {
      const reportUrl = this.getResolutionConflictReportUrl(validationTask, job.id);
      const deletionTaskBuildParams: BuildDeletionTaskParams = {
        polygonPartsEntityName,
        layerRelativePath,
        ingestionResolution: job.parameters.ingestionResolution,
        tileOutputFormat: additionalParams.tileOutputFormat,
        reportUrl,
      };
      const deletionTasks = this.buildTasks(task, deletionTaskBuildParams);
      await this.pushTasks(job.id, job.type, deletionTasks);
    } catch (err) {
      if (err instanceof NotFoundError) {
        logger.info({ msg: 'No resolution conflicts found, skipping deletion tasks generation' });
        return;
      } else {
        logger.error({ msg: 'Error occurred while building deletion tasks', error: err });
        throw err;
      }
    }
  }

  private async *buildDeletionTasksGenerator(
    initTask: IngestionCreateTasksTask,
    taskBuildParams: BuildDeletionTaskParams,
    parentSpan: Span | undefined
  ): AsyncGenerator<ICreateTaskBody<TilesDeletionParams>, void, void> {
    const { polygonPartsEntityName, layerRelativePath, ingestionResolution, tileOutputFormat, reportUrl } = taskBuildParams;
    const span = createChildSpan(`${TileDeletionTaskManager.name}.buildDeletionTasksGenerator`, parentSpan);
    const logger = this.logger.child({ jobId: initTask.jobId, polygonPartsEntityName });

    try {
      // 1. Read conflict features from the shapefile inside the ZIP report
      const conflictFeatures = await readConflictFeatures(reportUrl, this.shapefileReader, this.logger);

      if (conflictFeatures.length === 0) {
        const msg =
          'No conflict features found in report, cannot build deletion tasks, job is incorrectly configured - as resolution errors were detected but not shown in the report';
        this.logger.error({ msg });
        throw new UnprocessableEntityError(msg);
      }

      logger.info({ msg: 'Conflict features read from report', featureCount: conflictFeatures.length });

      // 2. Union all conflict geometries into one entity
      const conflictGeometries = conflictFeatures
        .filter((feature) => feature.properties?.e_res != null)
        .map((feature) => turfFeature(feature.geometry as Polygon | MultiPolygon));

      logger.info({ msg: 'Unioning conflict features into single geometry', conflictFeatureCount: conflictGeometries.length });
      const unionedConflictGeometry = conflictGeometries.length === 1 ? conflictGeometries[0] : union(turfFeatureCollection(conflictGeometries));

      if (unionedConflictGeometry === null) {
        logger.error({ msg: 'Union conflicted features returned null', conflictGeometries });
        throw new UnprocessableEntityError('Union of conflict features resulted in null');
      }

      const unionedGeometry = unionedConflictGeometry.geometry;

      // 3. iterating upward through zoom levels on the unioned geometry until an empty response
      const startZoom = degreesPerPixelToZoomLevel(ingestionResolution) + 1;
      logger.info({ msg: 'Iterating zoom levels for unioned conflict geometry', ingestionResolution, startZoom });

      let hasIntersections = true;
      for (let zoom = startZoom; zoomLevelToResolutionDeg(zoom) !== undefined && hasIntersections; zoom++) {
        const resolutionDegree = zoomLevelToResolutionDeg(zoom) as number;

        const payload: IntersectionFeatureCollection = turfFeatureCollection([turfFeature(unionedGeometry, { resolutionDegree })]);

        logger.info({ msg: 'Fetching intersection from polygon parts manager', polygonPartsEntityName, zoom, resolutionDegree });
        const response = await this.polygonPartsMangerClient.getIntersection(polygonPartsEntityName, payload);

        hasIntersections = response.features.length > 0;
        if (!hasIntersections) {
          logger.info({ msg: 'No intersection found at zoom level, stopping iteration', zoom });
          continue;
        }
        logger.debug({
          msg: 'Intersection received from polygon parts manager',
          polygonPartsEntityName,
          zoom,
          intersectionFeatures: response.features,
        });

        logger.info({ msg: 'Intersection received, creating deletion tasks', zoom });
        for (const intersectionFeature of response.features) {
          yield* this.createTasksForPart(intersectionFeature.geometry, zoom, layerRelativePath, tileOutputFormat, span);
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      logger.error({ msg: 'Failed to build deletion tasks', error });
      throw error;
    } finally {
      span.end();
    }
  }

  private async *createTasksForPart(
    geometry: Polygon | MultiPolygon,
    zoom: number,
    layerRelativePath: string,
    tileOutputFormat: string,
    parentSpan: Span | undefined
  ): AsyncGenerator<ICreateTaskBody<TilesDeletionParams>, void, void> {
    const span = createChildSpan(`${TileDeletionTaskManager.name}.${this.createTasksForPart.name}.zoom.${zoom}`, parentSpan);

    try {
      const feature = turfFeature(geometry);
      const rangeGenerator = this.tileRanger.encodeFootprint(feature, zoom);
      const batches = tileBatchGenerator(this.tileBatchSize, rangeGenerator);

      for await (const batch of batches) {
        const taskParameters: TilesDeletionParams = {
          tilesPath: layerRelativePath,
          ranges: batch,
          fileExtension: tileOutputFormat.toLowerCase(),
          sourceProvider: this.sourceProvider,
        };

        yield {
          description: 'deletion tiles task',
          parameters: taskParameters,
          type: this.taskType,
        };
      }
    } finally {
      span.end();
    }
  }

  private async fetchValidationTask(jobId: string): Promise<ITaskResponse<IngestionValidationTaskParams>> {
    const validationTaskType = this.config.get<string>('jobManagement.ingestion.tasks.validation.type');
    const validationTasks = await this.queueClient.jobManagerClient.findTasks<IngestionValidationTaskParams>({
      jobId,
      type: validationTaskType,
    });

    if (!validationTasks || validationTasks.length === 0) {
      throw new NotFoundError(`No validation tasks found for job ${jobId} with type ${validationTaskType}`);
    }

    return validationTasks[0];
  }

  private getResolutionConflictReportUrl(validationTask: ITaskResponse<IngestionValidationTaskParams>, jobId: string): string {
    const resolutionErrorCount = validationTask.parameters.errorsSummary?.errorsCount.resolution ?? 0;

    if (resolutionErrorCount === 0) {
      throw new NotFoundError(`No resolution conflicts found in validation task for job ${jobId}`);
    }

    const reportUrl = validationTask.parameters.report?.url;
    if (reportUrl === undefined) {
      throw new NotFoundError(`Validation task report URL not found for job ${jobId}`);
    }

    return reportUrl;
  }
}
