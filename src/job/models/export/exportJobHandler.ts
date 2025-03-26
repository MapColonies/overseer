import path from 'path';
import { inject, injectable } from 'tsyringe';
import { CallbackExportResponse, callbackExportResponseSchema, CallbacksStatus, CleanupData, RasterLayerMetadata } from '@map-colonies/raster-shared';
import { type Logger } from '@map-colonies/js-logger';
import { context, trace, Tracer } from '@opentelemetry/api';
import { ArtifactRasterType } from '@map-colonies/types';
import { OperationStatus, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import {
  CompletedOrFailedStatus,
  EXPORT_FAILURE_MESSAGE,
  EXPORT_SUCCESS_MESSAGE,
  GPKG_CONTENT_TYPE,
  GPKGS_PREFIX,
  SERVICES,
  StorageProvider,
} from '../../../common/constants';
import { JobHandler } from '../jobHandler';
import { TaskMetrics } from '../../../utils/metrics/taskMetrics';
import { ExportTask, ExportTaskParameters, IConfig, IJobHandler, JobAndTaskTelemetry } from '../../../common/interfaces';
import {
  ExportJob,
  ExportInitTask,
  ExportFinalizeTask,
  ExportFinalizeTaskParams,
  ExportFinalizeSuccessTaskParams,
  ExportFinalizeFailureTaskParams,
} from '../../../utils/zod/schemas/job.schema';
import { S3Service } from '../../../utils/storage/s3Service';
import { CatalogClient } from '../../../httpClients/catalogClient';
import { internalIdSchema } from '../../../utils/zod/schemas/jobParameters.schema';
import { ExportTaskManager } from '../../../task/models/exportTaskManager';
import { GeoPackageClient } from '../../../utils/db/geoPackageClient';
import { FSService } from '../../../utils/storage/fsService';
import { createExpirationDate } from '../../../utils/dateUtil';
import { CallbackClient } from '../../../httpClients/callbackClient';
import { JobTrackerClient } from '../../../httpClients/jobTrackerClient';

@injectable()
export class ExportJobHandler extends JobHandler implements IJobHandler<ExportJob, ExportInitTask, ExportJob, ExportFinalizeTask> {
  private readonly exportTaskType: string;
  private readonly gpkgsPath: string;
  private readonly isS3GpkgProvider: boolean;
  private readonly cleanupExpirationDays: number;
  private readonly downloadUrl: string;
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.CONFIG) config: IConfig,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    @inject(SERVICES.QUEUE_CLIENT) queueClient: QueueClient,
    @inject(JobTrackerClient) jobTrackerClient: JobTrackerClient,
    private readonly catalogClient: CatalogClient,
    private readonly exportTaskManager: ExportTaskManager,
    private readonly s3Service: S3Service,
    private readonly fsService: FSService,
    private readonly callbackClient: CallbackClient,
    private readonly gpkgService: GeoPackageClient,
    private readonly taskMetrics: TaskMetrics
  ) {
    super(logger, queueClient, jobTrackerClient);
    this.exportTaskType = config.get<string>('jobManagement.export.tasks.tilesExporting.type');
    this.gpkgsPath = config.get<string>('jobManagement.polling.jobs.export.gpkgsPath');
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const gpkgProvider = config.get<StorageProvider>('gpkgStorageProvider');
    this.isS3GpkgProvider = gpkgProvider === StorageProvider.S3;
    this.cleanupExpirationDays = config.get<number>('jobManagement.polling.jobs.export.cleanupExpirationDays');
    const downloadServerUrl = config.get<string>('servicesUrl.downloadServerPublicDNS');
    const downloadPath = config.get<string>('jobManagement.polling.jobs.export.downloadPath');
    this.downloadUrl = `${downloadServerUrl}/${downloadPath}`;
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

        await this.completeTask(job, task, { taskTracker: taskProcessTracking, tracingSpan: activeSpan });
      } catch (err) {
        await this.handleError(err, job, task, { taskTracker: taskProcessTracking, tracingSpan: activeSpan });
      } finally {
        activeSpan?.end();
      }
    });
  }

  public async handleJobFinalize(job: ExportJob, task: ExportFinalizeTask): Promise<void> {
    await context.with(
      trace.setSpan(context.active(), this.tracer.startSpan(`${ExportJobHandler.name}.${this.handleJobFinalize.name}`)),
      async () => {
        const activeSpan = trace.getActiveSpan();
        const monitorAttributes = { jobId: job.id, taskId: task.id, jobType: job.type, taskType: task.type };
        const logger = this.logger.child(monitorAttributes);
        const taskProcessTracking = this.taskMetrics.trackTaskProcessing(job.type, task.type);

        try {
          activeSpan?.setAttributes(monitorAttributes);

          const gpkgRelativePath = job.parameters.additionalParams.packageRelativePath;
          const gpkgFilePath = path.join(this.gpkgsPath, gpkgRelativePath);
          const gpkgDirPath = path.dirname(gpkgFilePath);
          let finalizeParams = task.parameters;

          logger.info({ msg: `Handling ${job.type} job finalization`, taskType: task.type });

          if (finalizeParams.status === OperationStatus.FAILED) {
            await this.handleFailedFinalizeTask(job, task, finalizeParams, gpkgDirPath, {
              taskTracker: taskProcessTracking,
              tracingSpan: activeSpan,
            });
            return;
          }

          if (!finalizeParams.gpkgModified) {
            activeSpan?.addEvent('gpkg.modification.started');
            finalizeParams = await this.modifyGpkgFile(gpkgFilePath, job, task.id, finalizeParams);
            activeSpan?.addEvent('gpkg.modification.completed', { success: finalizeParams.gpkgModified });
          }

          const shouldUploadToS3 = this.isS3GpkgProvider && finalizeParams.gpkgModified && !finalizeParams.gpkgUploadedToS3;

          logger.info({
            msg: 'Should upload to S3',
            shouldUploadToS3,
            isS3GpkgProvider: this.isS3GpkgProvider,
            gpkgModified: finalizeParams.gpkgModified,
            gpkgUploadedToS3: finalizeParams.gpkgUploadedToS3,
          });

          if (shouldUploadToS3) {
            activeSpan?.addEvent('s3.upload.started');
            finalizeParams = await this.uploadGpkgToS3(gpkgFilePath, gpkgRelativePath, job.id, task.id, finalizeParams);
            activeSpan?.addEvent('s3.upload.completed', { success: finalizeParams.gpkgUploadedToS3 });
          }

          const bypasS3OrUploaded = !this.isS3GpkgProvider || finalizeParams.gpkgUploadedToS3;
          const gpkgProcessingComplete = finalizeParams.gpkgModified && bypasS3OrUploaded;

          logger.info({
            msg: 'GPKG processing completed',
            success: gpkgProcessingComplete,
            gpkgModified: finalizeParams.gpkgModified,
            bypasS3OrUploaded,
          });

          if (gpkgProcessingComplete && !finalizeParams.callbacksSent) {
            activeSpan?.addEvent('callbacks.sending.started');
            await this.sendCallbacks(job, task.id, finalizeParams, gpkgDirPath);
            activeSpan?.addEvent('callbacks.sending.completed');
          }

          if (gpkgProcessingComplete) {
            activeSpan?.addEvent('all.steps.completed');
            logger.info({ msg: 'All finalize steps completed successfully' });
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

  private async handleFailedFinalizeTask(
    job: ExportJob,
    task: ExportFinalizeTask,
    finalizeParams: ExportFinalizeFailureTaskParams,
    gpkgDirPath: string,
    telemetry: JobAndTaskTelemetry
  ): Promise<void> {
    this.logger.info({ msg: 'Processing failed finalize task' });
    await this.updateCallbackParams(job, OperationStatus.FAILED, { errorReason: EXPORT_FAILURE_MESSAGE });
    await this.sendCallbacks(job, task.id, finalizeParams, gpkgDirPath);
    await this.completeTask(job, task, telemetry);
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

  private async modifyGpkgFile(
    gpkgFilePath: string,
    job: ExportJob,
    taskId: string,
    taskParams: ExportFinalizeSuccessTaskParams
  ): Promise<ExportFinalizeSuccessTaskParams> {
    this.logger.info({ msg: 'Modify gpkg file (create table from metadata)', jobId: job.id, taskId, gpkgFilePath });

    // TODO: Replace with real metadata
    const metadata = { example1: 'example1', example2: 'example2' };

    const isTableCreated = this.gpkgService.createTableFromMetadata(gpkgFilePath, metadata);
    if (isTableCreated) {
      const fileSize = await this.fsService.getFileSize(gpkgFilePath);
      await this.updateCallbackParams(job, OperationStatus.IN_PROGRESS, { fileSize });
      const updatedParams = await this.markFinalizeStepAsCompleted(job.id, taskId, taskParams, 'gpkgModified');
      return updatedParams;
    }
    return taskParams;
  }

  private async uploadGpkgToS3(
    gpkgFilePath: string,
    gpkgRelativePath: string,
    jobId: string,
    taskId: string,
    taskParams: ExportFinalizeSuccessTaskParams
  ): Promise<ExportFinalizeSuccessTaskParams> {
    const logger = this.logger.child({ jobId, taskId });

    const s3Key = `${GPKGS_PREFIX}/${gpkgRelativePath}`;
    logger.info({ msg: 'Upload gpkg file to S3', gpkgFilePath, s3Key, contentType: GPKG_CONTENT_TYPE });
    await this.s3Service.uploadFile(gpkgFilePath, s3Key, GPKG_CONTENT_TYPE);
    await this.fsService.deleteFileAndParentDir(gpkgFilePath);
    const updatedParams = await this.markFinalizeStepAsCompleted(jobId, taskId, taskParams, 'gpkgUploadedToS3');
    return updatedParams;
  }

  private async updateCallbackParams(job: ExportJob, status: CallbacksStatus, callbackParams: Partial<CallbackExportResponse> = {}): Promise<void> {
    const validInternalId = internalIdSchema.parse(job).internalId;
    job.parameters.callbackParams = {
      ...callbackParams,
      status,
      jobId: job.id,
      recordCatalogId: validInternalId,
      roi: job.parameters.exportInputParams.roi,
    };
    await this.queueClient.jobManagerClient.updateJob(job.id, { parameters: { ...job.parameters } });
  }

  private async sendCallbacks(job: ExportJob, taskId: string, taskParams: ExportFinalizeTaskParams, dirPath: string): Promise<boolean> {
    try {
      const cleanupExpirationTimeUTC = createExpirationDate(this.cleanupExpirationDays);
      const cleanupDataParams: CleanupData = { cleanupExpirationTimeUTC, directoryPath: dirPath };
      const callbackParams = this.createCallbacksParams(job, taskParams.status, cleanupExpirationTimeUTC);

      await this.queueClient.jobManagerClient.updateJob(job.id, {
        parameters: { ...job.parameters, cleanupDataParams, callbackParams },
      });

      const targetCallbacks = job.parameters.exportInputParams.callbackUrls;
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (!targetCallbacks?.length) {
        this.logger.info({ msg: 'No callbacks url provided, skipping callbacks sending', jobId: job.id });
        return false;
      }

      this.logger.info({ msg: 'Sending callbacks', jobId: job.id, status: taskParams.status, callbackCount: targetCallbacks.length });

      await Promise.all(
        targetCallbacks.map(async (callback) =>
          this.callbackClient.send(callback.url, callbackParams).catch((err) => {
            const error = err instanceof Error ? err.message : String(err);
            this.logger.error({
              msg: 'Failed to send callback',
              url: callback.url,
              jobId: job.id,
              error,
            });
          })
        )
      );

      const updatedParams = await this.markFinalizeStepAsCompleted(job.id, taskId, taskParams, 'callbacksSent');
      return updatedParams.callbacksSent;
    } catch (err) {
      this.logger.error({ msg: 'Sending callbacks has failed', err });
      throw err;
    }
  }

  private createCallbacksParams(job: ExportJob, status: CompletedOrFailedStatus, expirationDate: Date): CallbackExportResponse {
    const { additionalParams, callbackParams } = job.parameters;
    const { packageRelativePath, fileNamesTemplates } = additionalParams;
    const validCallbackParams = callbackExportResponseSchema.parse(callbackParams);

    const callbackResponse: CallbackExportResponse = {
      ...validCallbackParams,
      status,
      expirationTime: expirationDate,
      artifacts: [],
      links: undefined,
    };

    if (status === OperationStatus.COMPLETED) {
      const gpkgDownloadUrl = this.isS3GpkgProvider
        ? `${this.downloadUrl}/${GPKGS_PREFIX}/${packageRelativePath}`
        : `${this.downloadUrl}/${packageRelativePath}`; // later when we change download server mount directory, the path for s3 and fs should be the same

      callbackResponse.artifacts = [
        {
          name: fileNamesTemplates.packageName,
          type: ArtifactRasterType.GPKG,
          size: validCallbackParams.fileSize ?? 0,
          url: gpkgDownloadUrl,
        },
      ];

      callbackResponse.links = { dataURI: gpkgDownloadUrl };
      callbackResponse.description = EXPORT_SUCCESS_MESSAGE;
    }

    return callbackResponse;
  }
}
