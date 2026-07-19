import type { Logger } from '@map-colonies/js-logger';
import { context, trace, type Tracer } from '@opentelemetry/api';
import { TaskHandler as QueueClient, type ICreateTaskBody } from '@map-colonies/mc-priority-queue';
import { SourceType, type DeleteTaskParams, type DeleteStoredResourcesParams, type LayerName } from '@map-colonies/raster-shared';
import { inject, injectable } from 'tsyringe';
import type { IConfig, IJobHandler, JobAndTaskTelemetry, StepKey } from '../../../common/interfaces';
import { SERVICES, type StorageProvider } from '../../../common/constants';
import { LayerCacheNotFoundError } from '../../../common/errors';
import { CatalogClient } from '../../../httpClients/catalogClient';
import { GeoserverClient } from '../../../httpClients/geoserverClient';
import { MapproxyApiClient } from '../../../httpClients/mapproxyClient';
import { PolygonPartsMangerClient } from '../../../httpClients/polygonPartsMangerClient';
import { JobTrackerClient } from '../../../httpClients/jobTrackerClient';
import { TaskMetrics } from '../../../utils/metrics/taskMetrics';
import {
  extendedDeleteTaskParamsSchema,
  type DeleteLayerJob,
  type DeleteTask,
  type ExtendedDeleteTaskParams,
  type TilesLocation,
} from '../../../utils/zod/schemas/job.schema';
import { JobHandler } from '../jobHandler';

/** An ordered metadata-deletion step: the params flag that records its completion and the deletion it performs. */
interface DeletionStep {
  step: StepKey<ExtendedDeleteTaskParams>;
  run: () => Promise<unknown>;
}

@injectable()
export class DeleteLayerHandler extends JobHandler implements IJobHandler<never, never, never, never, DeleteLayerJob, DeleteTask> {
  private readonly tilesDeletionType: string;
  private readonly tilesStorageProvider: StorageProvider;
  private readonly tilesBucketConfig: string;

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
    this.tilesStorageProvider = this.config.get<StorageProvider>('tilesStorageProvider');
    this.tilesBucketConfig = this.config.get<string>('S3.tilesBucket');
  }

  public async handleJobDelete(job: DeleteLayerJob, task: DeleteTask): Promise<void> {
    await context.with(
      trace.setSpan(context.active(), this.tracer.startSpan(`${DeleteLayerHandler.name}.${this.handleJobDelete.name}`)),
      async () => {
        const activeSpan = trace.getActiveSpan();
        const telemetry: JobAndTaskTelemetry = { taskTracker: this.taskMetrics.trackTaskProcessing(job.type, task.type), tracingSpan: activeSpan };
        try {
          await this.runDeletionFlow(job, task, telemetry);
        } catch (err) {
          await this.handleError(err, job, task, telemetry);
        } finally {
          activeSpan?.end();
        }
      }
    );
  }

  private async runDeletionFlow(job: DeleteLayerJob, task: DeleteTask, telemetry: JobAndTaskTelemetry): Promise<void> {
    const activeSpan = telemetry.tracingSpan;
    const logger = this.logger.child({ jobId: job.id, taskId: task.id, jobType: job.type, taskType: task.type });
    const catalogId = job.internalId;
    const { layerName, polygonPartsEntityName } = this.validateAndGenerateLayerNameFormats(job);

    // parse to apply the schema defaults (undefined → false) and narrow to the required-boolean output type
    let params = extendedDeleteTaskParamsSchema.parse(task.parameters);
    const steps = this.getSteps(params);
    activeSpan?.setAttributes({ catalogId, layerName, polygonPartsEntityName });
    activeSpan?.addEvent(`${job.type}.${task.type}.start`, { ...steps });
    logger.info({ msg: `handling ${job.type} job with ${task.type} task`, catalogId });

    // the mapproxy cache is the only source of the tiles directory and the deleteFromMapproxy step destroys it,
    // resolve and persist the location before any deletion step — a redelivered task reads it from its own params
    let tilesLocation = params.tilesLocation;
    if (tilesLocation === undefined) {
      tilesLocation = await this.resolveTilesLocation(layerName);
      params = { ...params, tilesLocation };
      await this.queueClient.jobManagerClient.updateTask(job.id, task.id, { parameters: params });
      logger.info({ msg: 'tiles location resolved from mapproxy cache and persisted', ...tilesLocation });
      activeSpan?.addEvent('tilesLocation.resolved', { ...tilesLocation });
    }

    // ordered metadata deletion — persist each step immediately so a redelivered task resumes from where it failed (§4.2, §6)
    const deletionSteps: DeletionStep[] = [
      { step: 'deleteFromCatalog', run: async () => this.catalogClient.deleteRecord(catalogId) },
      { step: 'deleteFromGeoserver', run: async () => this.geoserverClient.unpublishLayer(layerName) },
      { step: 'deletePolygonParts', run: async () => this.polygonPartsMangerClient.deleteEntities(polygonPartsEntityName) },
      { step: 'deleteFromMapproxy', run: async () => this.mapproxyClient.removeLayer(layerName) },
    ];
    for (const { step, run } of deletionSteps) {
      if (params[step]) {
        continue;
      }
      await run();
      params = await this.markFinalizeStepAsCompleted(job.id, task.id, params, step);
      activeSpan?.addEvent(`${step}.success`, { ...steps });
    }

    if (this.isAllStepsCompleted(this.getSteps(params))) {
      logger.info({ msg: 'all metadata deletion steps completed, creating downstream cleaner tasks', ...this.getSteps(params) });
      await this.createCleanerTasks(job, tilesLocation);
      await this.completeTask(job, task, telemetry);
    }
  }

  // the persisted tilesLocation is not a completion step — strip it so step checks and span events see only the booleans
  private getSteps(params: ExtendedDeleteTaskParams): DeleteTaskParams {
    const { deleteFromCatalog, deleteFromGeoserver, deletePolygonParts, deleteFromMapproxy } = params;
    return { deleteFromCatalog, deleteFromGeoserver, deletePolygonParts, deleteFromMapproxy };
  }

  private async resolveTilesLocation(layerName: LayerName): Promise<TilesLocation> {
    const cache = await this.mapproxyClient.getLayerCache(layerName);
    const directory = cache?.cache.directory;
    if (directory === undefined) {
      throw new LayerCacheNotFoundError(layerName, this.tilesStorageProvider);
    }

    const path = this.toRelativeTilesPath(directory);
    if (path === '') {
      throw new LayerCacheNotFoundError(layerName, this.tilesStorageProvider);
    }

    if (this.tilesStorageProvider !== SourceType.S3) {
      return { path };
    }
    return { path, bucket: this.resolveTilesBucket(cache?.cache.bucket_name, layerName) };
  }

  /**
   * Normalizes the mapproxy cache directory into the relative path the Cleaner expects.
   * - S3: object keys carry no leading slash (mapproxy strips it when writing tiles), so only the leading slash is dropped.
   * - FS: the first segment is mapproxy's tiles-PVC mount path; the Cleaner remounts the same PVC at its own base, so it is dropped.
   */
  private toRelativeTilesPath(directory: string): string {
    return this.tilesStorageProvider === SourceType.S3 ? directory.replace(/^\/+/, '') : directory.replace(/^\/?[^/]+\//, '');
  }

  private resolveTilesBucket(cacheBucket: string | undefined, layerName: LayerName): string {
    if (cacheBucket !== undefined) {
      return cacheBucket;
    }
    this.logger.warn({ msg: 'tiles bucket not present on mapproxy cache, falling back to configuration', layerName, bucket: this.tilesBucketConfig });
    return this.tilesBucketConfig;
  }

  private async createCleanerTasks(job: DeleteLayerJob, tilesLocation: TilesLocation): Promise<void> {
    const logger = this.logger.child({ jobId: job.id });

    // bucket is always resolved for S3 in resolveTilesLocation; the fallback only satisfies the optional TilesLocation.bucket type
    const storage =
      this.tilesStorageProvider === SourceType.S3
        ? { storageProvider: this.tilesStorageProvider, bucket: tilesLocation.bucket ?? this.tilesBucketConfig }
        : { storageProvider: this.tilesStorageProvider };

    const tilesDeletionTask: ICreateTaskBody<DeleteStoredResourcesParams> = {
      type: this.tilesDeletionType,
      description: 'full layer tiles deletion',
      blockDuplication: true,
      parameters: { paths: [tilesLocation.path], ...storage },
    };

    logger.info({ msg: 'creating layer tiles deletion task', storageProvider: this.tilesStorageProvider, ...tilesLocation });
    await this.queueClient.jobManagerClient.createTaskForJob(job.id, tilesDeletionTask);

    // TODO: create cleaner tasks for artifacts deletion
  }
}
