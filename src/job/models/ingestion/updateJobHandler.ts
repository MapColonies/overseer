import { inject, injectable } from 'tsyringe';
import type { Logger } from '@map-colonies/js-logger';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import type { ITaskResponse } from '@map-colonies/mc-priority-queue';
import { context, trace } from '@opentelemetry/api';
import type { Tracer } from '@opentelemetry/api';
import type { IngestionUpdateFinalizeTaskParams, IngestionValidationTaskParams } from '@map-colonies/raster-shared';
import { NotFoundError } from '@map-colonies/error-types';
import {
  IngestionCreateTasksTask,
  IngestionUpdateFinalizeJob,
  IngestionUpdateFinalizeTask,
  IngestionUpdateCreateTasksJob,
} from '../../../utils/zod/schemas/job.schema';
import { PolygonPartsMangerClient } from '../../../httpClients/polygonPartsMangerClient';
import { CatalogClient } from '../../../httpClients/catalogClient';
import { ReadProductGeometry } from '../../../utils/storage/productReader';
import type { IConfig, IJobHandler, MergeTilesTaskParams, DeletionTilesTaskParams } from '../../../common/interfaces';
import { JobTrackerClient } from '../../../httpClients/jobTrackerClient';
import { Grid } from '../../../common/interfaces';
import { SERVICES } from '../../../common/constants';
import { TaskMetrics } from '../../../utils/metrics/taskMetrics';
import { TileMergeTaskManager } from '../../../task/models/tileMergeTaskManager';
import { TileDeletionTaskManager } from '../../../task/models/deletionTaskManager';
import { JobHandler } from '../jobHandler';
import { SeedingJobCreator } from './seedingJobCreator';

@injectable()
/* eslint-disable @typescript-eslint/brace-style */
export class UpdateJobHandler
  extends JobHandler
  implements IJobHandler<IngestionUpdateCreateTasksJob, IngestionCreateTasksTask, IngestionUpdateFinalizeJob, IngestionUpdateFinalizeTask>
{
  /* eslint-enable @typescript-eslint/brace-style */
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.CONFIG) protected readonly config: IConfig,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    @inject(TileMergeTaskManager) private readonly mergeTaskManager: TileMergeTaskManager,
    @inject(TileDeletionTaskManager) private readonly tileDeletionTaskManager: TileDeletionTaskManager,
    @inject(SERVICES.QUEUE_CLIENT) protected queueClient: QueueClient,
    @inject(CatalogClient) private readonly catalogClient: CatalogClient,
    @inject(SeedingJobCreator) private readonly seedingJobCreator: SeedingJobCreator,
    @inject(JobTrackerClient) jobTrackerClient: JobTrackerClient,
    @inject(PolygonPartsMangerClient) private readonly polygonPartsMangerClient: PolygonPartsMangerClient,
    @inject(SERVICES.PRODUCT_READER) private readonly readProductGeometry: ReadProductGeometry,
    private readonly taskMetrics: TaskMetrics
  ) {
    super(logger, config, queueClient, jobTrackerClient);
  }

  public async handleJobInit(job: IngestionUpdateCreateTasksJob, task: IngestionCreateTasksTask): Promise<void> {
    await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${UpdateJobHandler.name}.${this.handleJobInit.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();

      const logger = this.logger.child({ jobId: job.id, taskId: task.id, jobType: job.type });
      const taskProcessTracking = this.taskMetrics.trackTaskProcessing(job.type, task.type);

      try {
        const { inputFiles, additionalParams, metadata } = job.parameters;

        activeSpan?.setAttributes({ ...metadata });

        activeSpan?.addEvent('validateAdditionalParams.success');

        const productGeometry = await this.readProductGeometry(inputFiles.productShapefilePath);
        const layerRelativePath = `${job.internalId}/${additionalParams.displayPath}`;

        const taskBuildParams: MergeTilesTaskParams = {
          inputFiles,
          taskMetadata: {
            layerRelativePath,
            tileOutputFormat: additionalParams.tileOutputFormat,
            isNewTarget: false,
            grid: Grid.TWO_ON_ONE,
          },
          ingestionResolution: job.parameters.ingestionResolution,
          productGeometry,
        };

        logger.info({ msg: 'building tasks' });

        const { polygonPartsEntityName } = this.validateAndGenerateLayerNameFormats(job);

        await this.buildAndPushDeletionTasks(job, task, polygonPartsEntityName, layerRelativePath);

        const mergeTasks = this.mergeTaskManager.buildTasks(taskBuildParams, task);

        await this.mergeTaskManager.pushTasks(task, job.id, job.type, mergeTasks);

        await this.completeTask(job, task, { taskTracker: taskProcessTracking, tracingSpan: activeSpan });
      } catch (err) {
        await this.handleError(err, job, task, { taskTracker: taskProcessTracking, tracingSpan: activeSpan });
      } finally {
        activeSpan?.end();
      }
    });
  }

  public async handleJobFinalize(job: IngestionUpdateFinalizeJob, task: IngestionUpdateFinalizeTask): Promise<void> {
    await context.with(
      trace.setSpan(context.active(), this.tracer.startSpan(`${UpdateJobHandler.name}.${this.handleJobFinalize.name}`)),
      async () => {
        const activeSpan = trace.getActiveSpan();
        const logger = this.logger.child({ jobId: job.id, taskId: task.id, jobType: job.type, taskType: task.type });
        const taskProcessTracking = this.taskMetrics.trackTaskProcessing(job.type, task.type);

        try {
          logger.info({ msg: `handling ${job.type} job with ${task.type} task` });
          let finalizeTaskParams: IngestionUpdateFinalizeTaskParams = task.parameters;
          activeSpan?.addEvent(`${job.type}.${task.type}.start`, { ...finalizeTaskParams });

          const { updatedInCatalog, processedParts } = finalizeTaskParams;
          const layerNameFormats = this.validateAndGenerateLayerNameFormats(job);
          const { layerName, polygonPartsEntityName } = layerNameFormats;
          activeSpan?.addEvent('layerNameFormat.valid', { layerName: layerNameFormats.layerName });

          if (!processedParts) {
            const { resourceId, productType } = job;

            await this.polygonPartsMangerClient.process({ productId: resourceId, productType });
            finalizeTaskParams = await this.markFinalizeStepAsCompleted(job.id, task.id, finalizeTaskParams, 'processedParts');

            activeSpan?.addEvent('processPolygonParts.success', { ...finalizeTaskParams });
            logger.info({ msg: 'polygon parts processed successfully', productId: resourceId, productType });
          }

          if (!updatedInCatalog) {
            logger.info({ msg: 'Updating layer in catalog', catalogId: job.internalId });
            await this.catalogClient.update(job, polygonPartsEntityName);
            finalizeTaskParams = await this.markFinalizeStepAsCompleted(job.id, task.id, finalizeTaskParams, 'updatedInCatalog');
            activeSpan?.addEvent('updateCatalog.success', { ...finalizeTaskParams });
          }

          if (this.isAllStepsCompleted(finalizeTaskParams)) {
            logger.info({ msg: 'All finalize steps completed successfully', ...finalizeTaskParams });
            await this.completeTask(job, task, { taskTracker: taskProcessTracking, tracingSpan: activeSpan });

            activeSpan?.addEvent('createSeedingJob.start', { layerName });
            await this.seedingJobCreator.create({ layerName, ingestionJob: job });
          }
        } catch (err) {
          await this.handleError(err, job, task, { taskTracker: taskProcessTracking, tracingSpan: activeSpan });
        } finally {
          activeSpan?.end();
        }
      }
    );
  }

  private async buildAndPushDeletionTasks(
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
      const deletionTaskBuildParams: DeletionTilesTaskParams = {
        polygonPartsEntityName,
        layerRelativePath,
        ingestionResolution: job.parameters.ingestionResolution,
        tileOutputFormat: additionalParams.tileOutputFormat,
        reportUrl,
      };
      const deletionTasks = this.tileDeletionTaskManager.buildTasks(task, deletionTaskBuildParams);
      await this.tileDeletionTaskManager.pushTasks(job.id, job.type, deletionTasks);
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
