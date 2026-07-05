/* eslint-disable @typescript-eslint/naming-convention */
import type { Logger } from '@map-colonies/js-logger';
import { context, trace, type Tracer } from '@opentelemetry/api';
import { TaskHandler as QueueClient, type ICreateTaskBody } from '@map-colonies/mc-priority-queue';
import {
  deleteTaskParamsSchema,
  SourceType,
  type DeleteTaskParams,
  type LayerName,
  type LayerTilesDeletionParams,
} from '@map-colonies/raster-shared';
import { inject, injectable } from 'tsyringe';
import type { IConfig, IJobHandler } from '../../../common/interfaces';
import { SERVICES, type StorageProvider } from '../../../common/constants';
import { CatalogClient } from '../../../httpClients/catalogClient';
import { GeoserverClient } from '../../../httpClients/geoserverClient';
import { MapproxyApiClient } from '../../../httpClients/mapproxyClient';
import { PolygonPartsMangerClient } from '../../../httpClients/polygonPartsMangerClient';
import { JobTrackerClient } from '../../../httpClients/jobTrackerClient';
import { TaskMetrics } from '../../../utils/metrics/taskMetrics';
import type { DeleteLayerJob, DeleteTask } from '../../../utils/zod/schemas/job.schema';
import { JobHandler } from '../jobHandler';

@injectable()
export class DeleteLayerHandler extends JobHandler implements IJobHandler<never, never, never, never, DeleteLayerJob, DeleteTask> {
  private readonly tilesDeletionType: string;

  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.CONFIG) protected override readonly config: IConfig,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    @inject(SERVICES.QUEUE_CLIENT) queueClient: QueueClient,
    @inject(CatalogClient) private readonly catalogClient: CatalogClient,
    @inject(GeoserverClient) private readonly geoserverClient: GeoserverClient,
    @inject(PolygonPartsMangerClient) private readonly polygonPartsMangerClient: PolygonPartsMangerClient,
    @inject(MapproxyApiClient) private readonly mapproxyClient: MapproxyApiClient,
    @inject(JobTrackerClient) jobTrackerClient: JobTrackerClient,
    private readonly taskMetrics: TaskMetrics
  ) {
    super(logger, config, queueClient, jobTrackerClient);
    // whole-layer tiles deletion shares the 'tiles-deletion' task type with the range-based ingestion flow (raster-shared DeletionTaskTypes.LayerTilesDeletion); the Cleaner distinguishes them by params shape
    this.tilesDeletionType = this.config.get<string>('jobManagement.ingestion.tasks.tilesDeletion.type');
  }

  public async handleJobDelete(job: DeleteLayerJob, task: DeleteTask): Promise<void> {
    await context.with(
      trace.setSpan(context.active(), this.tracer.startSpan(`${DeleteLayerHandler.name}.${this.handleJobDelete.name}`)),
      async () => {
        const activeSpan = trace.getActiveSpan();
        const logger = this.logger.child({ jobId: job.id, taskId: task.id, jobType: job.type, taskType: task.type });
        const taskProcessTracking = this.taskMetrics.trackTaskProcessing(job.type, task.type);

        try {
          const catalogId = job.internalId;
          const { layerName, polygonPartsEntityName } = this.validateAndGenerateLayerNameFormats(job);
          // resolved before the deleteFromMapproxy step — once the layer is removed from mapproxy, getCache
          // returns 404 and only the S3.tilesBucket config fallback remains (relevant for redelivered tasks)
          const tilesBucket = await this.resolveTilesBucket(layerName);
          // parse to apply the schema defaults (undefined → false) and narrow to the required-boolean output type
          let params: DeleteTaskParams = deleteTaskParamsSchema.parse(task.parameters);
          activeSpan?.setAttributes({ catalogId, layerName, polygonPartsEntityName });
          activeSpan?.addEvent(`${job.type}.${task.type}.start`, { ...params });
          logger.info({ msg: `handling ${job.type} job with ${task.type} task`, catalogId });

          // ordered metadata deletion — persist each boolean immediately so a redelivered task resumes from the failed step (§4.2, §6)
          if (!params.deleteFromCatalog) {
            await this.catalogClient.deleteRecord(catalogId);
            params = await this.markFinalizeStepAsCompleted(job.id, task.id, params, 'deleteFromCatalog');
            activeSpan?.addEvent('deleteFromCatalog.success', { ...params });
          }

          if (!params.deleteFromGeoserver) {
            await this.geoserverClient.unpublishLayer(layerName);
            params = await this.markFinalizeStepAsCompleted(job.id, task.id, params, 'deleteFromGeoserver');
            activeSpan?.addEvent('deleteFromGeoserver.success', { ...params });
          }

          if (!params.deletePolygonParts) {
            await this.polygonPartsMangerClient.deleteEntities(polygonPartsEntityName);
            params = await this.markFinalizeStepAsCompleted(job.id, task.id, params, 'deletePolygonParts');
            activeSpan?.addEvent('deletePolygonParts.success', { ...params });
          }

          if (!params.deleteFromMapproxy) {
            await this.mapproxyClient.removeLayer(layerName);
            params = await this.markFinalizeStepAsCompleted(job.id, task.id, params, 'deleteFromMapproxy');
            activeSpan?.addEvent('deleteFromMapproxy.success', { ...params });
          }

          if (this.isAllStepsCompleted(params)) {
            logger.info({ msg: 'all metadata deletion steps completed, creating downstream cleaner tasks', ...params });
            await this.createCleanerTasks(job, catalogId, tilesBucket);
            await this.completeTask(job, task, { taskTracker: taskProcessTracking, tracingSpan: activeSpan });
          }
        } catch (err) {
          await this.handleError(err, job, task, { taskTracker: taskProcessTracking, tracingSpan: activeSpan });
        } finally {
          activeSpan?.end();
        }
      }
    );
  }

  private async resolveTilesBucket(layerName: LayerName): Promise<string | undefined> {
    const sourceProvider = this.config.get<StorageProvider>('tilesStorageProvider');
    if (sourceProvider !== SourceType.S3) {
      return undefined;
    }

    const mapproxyBucket = await this.mapproxyClient.getS3CacheBucketName(layerName);
    if (mapproxyBucket !== undefined) {
      return mapproxyBucket;
    }

    const configBucket = this.config.get<string>('S3.tilesBucket');
    this.logger.warn({ msg: 'tiles bucket could not be resolved from mapproxy cache, falling back to configuration', layerName, configBucket });
    return configBucket;
  }

  private async createCleanerTasks(job: DeleteLayerJob, catalogId: string, bucket: string | undefined): Promise<void> {
    const sourceProvider = this.config.get<StorageProvider>('tilesStorageProvider');
    const logger = this.logger.child({ jobId: job.id, catalogId });

    // idempotency guard (§6): a redelivered task must not create duplicate cleaner tasks
    const existingTilesTasks = await this.queueClient.jobManagerClient.findTasks<LayerTilesDeletionParams>({
      jobId: job.id,
      type: this.tilesDeletionType,
    });

    if (existingTilesTasks && existingTilesTasks.length > 0) {
      logger.info({ msg: 'layer tiles deletion task already exists, skipping creation', type: this.tilesDeletionType });
      return;
    }

    const tilesDeletionTask: ICreateTaskBody<LayerTilesDeletionParams> = {
      type: this.tilesDeletionType,
      description: 'full layer tiles deletion',
      parameters: { catalogId, sourceProvider, bucket },
    };

    logger.info({ msg: 'creating layer tiles deletion task', sourceProvider, bucket });
    await this.queueClient.jobManagerClient.createTaskForJob(job.id, tilesDeletionTask);

    // TODO(§11 open questions): artifacts-deletion task creation is deferred — the existence source of truth
    // (mapproxy GET /layer does not expose artifacts) and the params shape (catalogId-derived vs explicit paths)
    // are unresolved. Surface in the PR description.
  }
}
