import { inject, injectable } from 'tsyringe';
import type { Logger } from '@map-colonies/js-logger';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { context, trace } from '@opentelemetry/api';
import type { Tracer } from '@opentelemetry/api';
import type { IngestionUpdateFinalizeTaskParams } from '@map-colonies/raster-shared';
import {
  IngestionCreateMergeTasksTask,
  IngestionUpdateFinalizeJob,
  IngestionUpdateFinalizeTask,
  IngestionUpdateCreateMergeTasksJob,
} from '../../../utils/zod/schemas/job.schema';
import { PolygonPartsMangerClient } from '../../../httpClients/polygonPartsMangerClient';
import { CatalogClient } from '../../../httpClients/catalogClient';
import type { IConfig, IJobHandler, MergeTilesTaskParams } from '../../../common/interfaces';
import { JobTrackerClient } from '../../../httpClients/jobTrackerClient';
import { Grid } from '../../../common/interfaces';
import { SERVICES } from '../../../common/constants';
import { TaskMetrics } from '../../../utils/metrics/taskMetrics';
import { TileMergeTaskManager } from '../../../task/models/tileMergeTaskManager';
import { JobHandler } from '../jobHandler';
import { SeedingJobCreator } from './seedingJobCreator';

@injectable()
/* eslint-disable @typescript-eslint/brace-style */
export class UpdateJobHandler
  extends JobHandler
  implements IJobHandler<IngestionUpdateCreateMergeTasksJob, IngestionCreateMergeTasksTask, IngestionUpdateFinalizeJob, IngestionUpdateFinalizeTask>
{
  /* eslint-enable @typescript-eslint/brace-style */
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.CONFIG) protected readonly config: IConfig,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    @inject(TileMergeTaskManager) private readonly taskBuilder: TileMergeTaskManager,
    @inject(SERVICES.QUEUE_CLIENT) protected queueClient: QueueClient,
    @inject(CatalogClient) private readonly catalogClient: CatalogClient,
    @inject(SeedingJobCreator) private readonly seedingJobCreator: SeedingJobCreator,
    @inject(JobTrackerClient) jobTrackerClient: JobTrackerClient,
    @inject(PolygonPartsMangerClient) private readonly polygonPartsMangerClient: PolygonPartsMangerClient,
    private readonly taskMetrics: TaskMetrics
  ) {
    super(logger, config, queueClient, jobTrackerClient);
  }

  public async handleJobInit(job: IngestionUpdateCreateMergeTasksJob, task: IngestionCreateMergeTasksTask): Promise<void> {
    await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${UpdateJobHandler.name}.${this.handleJobInit.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();

      const logger = this.logger.child({ jobId: job.id, taskId: task.id, jobType: job.type });
      const taskProcessTracking = this.taskMetrics.trackTaskProcessing(job.type, task.type);

      try {
        const { inputFiles, additionalParams, metadata } = job.parameters;

        activeSpan?.setAttributes({ ...metadata });

        activeSpan?.addEvent('validateAdditionalParams.success');

        const taskBuildParams: MergeTilesTaskParams = {
          inputFiles,
          taskMetadata: {
            layerRelativePath: `${job.internalId}/${additionalParams.displayPath}`,
            tileOutputFormat: additionalParams.tileOutputFormat,
            isNewTarget: false,
            grid: Grid.TWO_ON_ONE,
          },
          ingestionResolution: job.parameters.ingestionResolution,
        };

        logger.info({ msg: 'building tasks' });
        const mergeTasks = await this.taskBuilder.buildTasks(taskBuildParams, task);

        await this.taskBuilder.pushTasks(task, job.id, job.type, mergeTasks);

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
            const { productName, productType } = job;
            logger.info({ msg: 'processing polygon parts', productName, productType });

            await this.polygonPartsMangerClient.process(productName, productType);
            finalizeTaskParams = await this.markFinalizeStepAsCompleted(job.id, task.id, finalizeTaskParams, 'processedParts');

            activeSpan?.addEvent('processPolygonParts.success', { ...finalizeTaskParams });
            logger.info({ msg: 'polygon parts processed successfully', productName, productType });
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
}
