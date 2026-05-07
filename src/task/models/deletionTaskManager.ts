import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Span, Tracer } from '@opentelemetry/api';
import { degreesPerPixelToZoomLevel, tileBatchGenerator, TileRanger, zoomLevelToResolutionDeg } from '@map-colonies/mc-utils';
import { feature as turfFeature, featureCollection as turfFeatureCollection, union } from '@turf/turf';
import { inject, injectable } from 'tsyringe';
import type { Logger } from '@map-colonies/js-logger';
import { ShapefileChunkReader } from '@map-colonies/shapefile-reader';
import type { IngestionValidationTaskParams, IntersectionFeatureCollection, TilesDeletionParams } from '@map-colonies/raster-shared';
import type { ICreateTaskBody } from '@map-colonies/mc-priority-queue';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import type { IConfig } from 'config';
import type { MultiPolygon, Polygon } from 'geojson';
import { SERVICES, StorageProvider } from '../../common/constants';
import { TaskMetrics } from '../../utils/metrics/taskMetrics';
import { createChildSpan } from '../../common/tracing';
import { IngestionCreateTasksTask } from '../../utils/zod/schemas/job.schema';
import { PolygonPartsMangerClient } from '../../httpClients/polygonPartsMangerClient';
import { S3Service } from '../../utils/storage/s3Service';
import { readConflictFeatures } from '../../utils/reportUtil';

@injectable()
export class TileDeletionTaskManager {
  private readonly tileBatchSize: number;
  private readonly taskBatchSize: number;
  private readonly taskType: string;
  private readonly validationTaskType: string;
  private readonly sourceProvider: StorageProvider;
  private readonly reportProvider: StorageProvider;
  private readonly shapefileReader: ShapefileChunkReader;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.TRACER) private readonly tracer: Tracer,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.QUEUE_CLIENT) private readonly queueClient: QueueClient,
    @inject(SERVICES.TILE_RANGER) private readonly tileRanger: TileRanger,
    @inject(PolygonPartsMangerClient) private readonly polygonPartsMangerClient: PolygonPartsMangerClient,
    private readonly taskMetrics: TaskMetrics,
    @inject(S3Service) private readonly s3Service: S3Service
  ) {
    this.tileBatchSize = this.config.get<number>('jobManagement.ingestion.tasks.tilesDeletion.tileBatchSize');
    this.taskBatchSize = this.config.get<number>('jobManagement.ingestion.tasks.tilesDeletion.taskBatchSize');
    this.taskType = this.config.get<string>('jobManagement.ingestion.tasks.tilesDeletion.type');
    this.validationTaskType = this.config.get<string>('jobManagement.ingestion.tasks.validation.type');
    this.sourceProvider = this.config.get<StorageProvider>('tilesStorageProvider');
    this.reportProvider = this.config.get<StorageProvider>('reportStorageProvider');
    this.shapefileReader = new ShapefileChunkReader({
      maxVerticesPerChunk: this.config.get<number>('shapefileReader.maxVerticesPerChunk'),
    });
  }

  public buildTasks(
    initTask: IngestionCreateTasksTask,
    polygonPartsEntityName: string,
    layerRelativePath: string,
    ingestionResolution: number,
    tileOutputFormat: string
  ): AsyncGenerator<ICreateTaskBody<TilesDeletionParams>, void, void> {
    return context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${TileDeletionTaskManager.name}.${this.buildTasks.name}`)), () => {
      const activeSpan = trace.getActiveSpan();
      return this.buildDeletionTasksGenerator(initTask, polygonPartsEntityName, layerRelativePath, ingestionResolution, tileOutputFormat, activeSpan);
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

  private async *buildDeletionTasksGenerator(
    initTask: IngestionCreateTasksTask,
    polygonPartsEntityName: string,
    layerRelativePath: string,
    ingestionResolution: number,
    tileOutputFormat: string,
    parentSpan: Span | undefined
  ): AsyncGenerator<ICreateTaskBody<TilesDeletionParams>, void, void> {
    const span = createChildSpan(`${TileDeletionTaskManager.name}.buildDeletionTasksGenerator`, parentSpan);
    const logger = this.logger.child({ jobId: initTask.jobId, polygonPartsEntityName });

    try {
      // 1. Fetch the validation task
      const validationTasks = await this.queueClient.jobManagerClient.findTasks<IngestionValidationTaskParams>({
        jobId: initTask.jobId,
        type: this.validationTaskType,
      });

      if (!validationTasks || validationTasks.length === 0) {
        throw new Error(`Validation task for job ${initTask.jobId} not found. Cannot build deletion tasks.`);
      }

      const validationTask = validationTasks[0];

      // 2. Check for resolution conflicts
      const resolutionErrorCount = validationTask.parameters.errorsSummary?.errorsCount.resolution ?? 0;
      if (resolutionErrorCount === 0) {
        logger.info({ msg: 'No resolution conflicts found, skipping deletion task creation' });
        return;
      }

      logger.info({ msg: 'Resolution conflicts detected, building deletion tasks', resolutionErrorCount });
      span.addEvent('resolution conflicts found', { resolutionErrorCount });

      // 3. Get report path
      const reportPath = validationTask.parameters.report?.path;
      if (reportPath === undefined) {
        throw new Error(`Validation task report path not found for job ${initTask.jobId}`);
      }

      // 4. Read conflict features from the shapefile inside the ZIP report
      const conflictFeatures = await readConflictFeatures(reportPath, this.reportProvider, this.s3Service, this.shapefileReader, this.logger);

      if (conflictFeatures.length === 0) {
        logger.info({ msg: 'No conflict features found in report shapefile, skipping deletion task creation' });
        return;
      }

      logger.info({ msg: 'Conflict features read from report', featureCount: conflictFeatures.length });

      // 5. Union all conflict geometries into one entity
      const conflictGeometries = conflictFeatures.map((f) => turfFeature(f.geometry as Polygon | MultiPolygon));
      const unionedConflict = union(turfFeatureCollection(conflictGeometries));

      if (unionedConflict === null) {
        logger.info({ msg: 'Union of conflict features resulted in null, skipping deletion task creation' });
        return;
      }

      const unionedGeometry = unionedConflict.geometry;

      logger.info({ msg: 'Unioned conflict features into single geometry' });

      // 6. Sweep upward through zoom levels on the unioned geometry until an empty response
      const startZoom = degreesPerPixelToZoomLevel(ingestionResolution) + 1;
      logger.info({ msg: 'Sweeping zoom levels for unioned conflict geometry', ingestionResolution, startZoom });

      for (let zoom = startZoom; ; zoom++) {
        const resDeg = zoomLevelToResolutionDeg(zoom);
        if (resDeg === undefined) {
          logger.warn({ msg: 'Reached end of valid zoom range while sweeping, stopping', zoom });
          break;
        }

        const payload: IntersectionFeatureCollection = turfFeatureCollection([turfFeature(unionedGeometry, { resolutionDegree: resDeg })]);

        logger.info({ msg: 'Fetching intersection from polygon parts manager', polygonPartsEntityName, zoom, resDeg });
        const response = await this.polygonPartsMangerClient.getIntersection(polygonPartsEntityName, payload);

        if (response.features.length === 0) {
          logger.info({ msg: 'No intersection found at zoom level, stopping sweep', zoom });
          break;
        }

        logger.info({ msg: 'Intersection received, creating deletion tasks', featureCount: response.features.length, zoom });
        for (const intersectionFeature of response.features) {
          yield* this.createTasksForPart(intersectionFeature.geometry, zoom, layerRelativePath, tileOutputFormat, span);
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
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
    const span = createChildSpan(`${TileDeletionTaskManager.name}.createTasksForPart.zoom.${zoom}`, parentSpan);

    try {
      const part = turfFeature(geometry);
      const rangeGenerator = this.tileRanger.encodeFootprint(part, zoom);
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
}
