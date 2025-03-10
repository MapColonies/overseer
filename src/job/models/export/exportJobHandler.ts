import path from 'path';
import { RasterLayerMetadata } from '@map-colonies/raster-shared';
import { inject, injectable } from 'tsyringe';
import { type Logger } from '@map-colonies/js-logger';
import { context, trace, Tracer } from '@opentelemetry/api';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { GPKG_CONTENT_TYPE, SERVICES, StorageProvider } from '../../../common/constants';
import { JobHandler } from '../jobHandler';
import { TaskMetrics } from '../../../utils/metrics/taskMetrics';
import { ExportTask, ExportTaskParameters, IConfig, IJobHandler } from '../../../common/interfaces';
import { ExportJob, ExportInitTask, ExportFinalizeTask, ExportFinalizeTaskParams } from '../../../utils/zod/schemas/job.schema';
import { CatalogClient } from '../../../httpClients/catalogClient';
import { internalIdSchema } from '../../../utils/zod/schemas/jobParameters.schema';
import { ExportTaskManager } from '../../../task/models/exportTaskManager';
import { S3Service } from '../../../utils/storage/s3Service';

@injectable()
export class ExportJobHandler extends JobHandler implements IJobHandler<ExportJob, ExportInitTask, ExportJob, ExportFinalizeTask> {
  private readonly exportTaskType: string;
  private readonly gpkgsPath: string;
  private readonly isS3GpkgProvider: boolean;
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.CONFIG) config: IConfig,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    @inject(SERVICES.QUEUE_CLIENT) queueClient: QueueClient,
    @inject(CatalogClient) private readonly catalogClient: CatalogClient,
    @inject(ExportTaskManager) private readonly exportTaskManager: ExportTaskManager,
    @inject(S3Service) private readonly s3Service: S3Service,
    private readonly taskMetrics: TaskMetrics
  ) {
    super(logger, queueClient);
    this.exportTaskType = config.get<string>('jobManagement.export.tasks.tilesExporting.type');
    this.gpkgsPath = config.get<string>('jobManagement.polling.jobs.export.gpkgsPath');
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const gpkgProvider = config.get<StorageProvider>('gpkgStorageProvider');
    this.isS3GpkgProvider = gpkgProvider === StorageProvider.S3;
  }
  public async handleJobInit(job: ExportJob, task: ExportInitTask): Promise<void> {
    await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${ExportJobHandler.name}.${this.handleJobInit.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();
      const monitorAttributes = { jobId: job.id, taskId: task.id, jobType: job.type, taskType: task.type };
      const logger = this.logger.child(monitorAttributes);
      const taskProcessTracking = this.taskMetrics.trackTaskProcessing(job.type, task.type);

      try {
        activeSpan?.setAttributes(monitorAttributes);

        logger.info({ msg: `handling ${job.type} job with ${job.type} task` });

        const validInternalId = internalIdSchema.parse(job).internalId;
        activeSpan?.addEvent('internalId.validated');
        logger.debug({ msg: 'internalId validation passed', internalId: validInternalId });

        const { metadata } = await this.catalogClient.findLayer(validInternalId);

        activeSpan?.addEvent('findLayer.success');

        const exportTask = this.createExportTask(job, metadata);
        logger.debug({ msg: 'export task created', exportTask });

        activeSpan?.addEvent('exportTask.created', { exportTask: JSON.stringify(exportTask) });

        await this.queueClient.jobManagerClient.createTaskForJob(job.id, exportTask);
        this.taskMetrics.trackTasksEnqueue(job.type, this.exportTaskType, exportTask.parameters.batches.length);
        activeSpan?.addEvent('exportTask.enqueued');

        await this.completeInitTask(job, task, { taskTracker: taskProcessTracking, tracingSpan: activeSpan });
      } catch (err) {
        await this.handleError(err, job, task, { taskTracker: taskProcessTracking, tracingSpan: activeSpan });
      } finally {
        activeSpan?.end();
      }
    });
  }

  /* istanbul ignore next @preserve */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async handleJobFinalize(job: ExportJob, task: ExportFinalizeTask): Promise<void> {
    let finalizeTaskParams: ExportFinalizeTaskParams = task.parameters;
    const gpkgRelativePath = job.parameters.additionalParams.packageRelativePath;

    const { gpkgModified, gpkgUploadedToS3, callbacksSent } = finalizeTaskParams;

    const gpkgPath = '/home/almogk/Documents/test_epxort';

    const gpkgFilePath = path.join(gpkgPath, gpkgRelativePath);

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    const shouldUploadToS3 = this.isS3GpkgProvider && gpkgModified && !gpkgUploadedToS3;
    if (shouldUploadToS3) {
      await this.s3Service.uploadFile(gpkgFilePath, gpkgRelativePath, GPKG_CONTENT_TYPE);

      finalizeTaskParams = await this.markFinalizeStepAsCompleted(job.id, task.id, finalizeTaskParams, 'gpkgUploadedToS3');
    }
    await Promise.resolve();
    throw new Error('Method not implemented.');
  }

  private createExportTask(job: ExportJob, metadata: RasterLayerMetadata): ExportTask {
    const logger = this.logger.child({ jobId: job.id, jobType: job.type, layerId: metadata.id });
    const activeSpan = trace.getActiveSpan();
    const { exportInputParams, additionalParams } = job.parameters;
    const { targetFormat, outputFormatStrategy } = additionalParams;

    const batches = this.exportTaskManager.generateTileRangeBatches(exportInputParams.roi, metadata);
    logger.info({ msg: 'tile range batches generated', batchesCount: batches.length });

    const sources = this.exportTaskManager.generateSources(job, metadata);
    logger.info({ msg: 'sources generated', sources });

    const params: ExportTaskParameters = {
      isNewTarget: true,
      targetFormat,
      outputFormatStrategy,
      sources,
      batches,
      traceParentContext: activeSpan?.spanContext(),
    };

    const exportTask: ExportTask = {
      type: this.exportTaskType,
      parameters: params,
    };

    logger.info({ msg: 'export task created', exportTaskType: exportTask.type });

    return exportTask;
  }
}
