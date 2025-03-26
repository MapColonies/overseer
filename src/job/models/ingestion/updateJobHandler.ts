import { inject, injectable } from 'tsyringe';
import type { Logger } from '@map-colonies/js-logger';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { context, trace } from '@opentelemetry/api';
import type { Tracer } from '@opentelemetry/api';
import type { IngestionUpdateFinalizeTaskParams } from '@map-colonies/raster-shared';
import {
  IngestionInitTask,
  IngestionUpdateFinalizeJob,
  IngestionUpdateFinalizeTask,
  IngestionUpdateInitJob,
} from '../../../utils/zod/schemas/job.schema';
import { CatalogClient } from '../../../httpClients/catalogClient';
import type { IConfig, IJobHandler, MergeTilesTaskParams } from '../../../common/interfaces';
import { JobTrackerClient } from '../../../httpClients/jobTrackerClient';
import { Grid } from '../../../common/interfaces';
import { SeedMode, SERVICES } from '../../../common/constants';
import { TaskMetrics } from '../../../utils/metrics/taskMetrics';
import { TileMergeTaskManager } from '../../../task/models/tileMergeTaskManager';
import { JobHandler } from '../jobHandler';
import { SeedingJobCreator } from './seedingJobCreator';

@injectable()
/* eslint-disable @typescript-eslint/brace-style */
export class UpdateJobHandler
  extends JobHandler
  implements IJobHandler<IngestionUpdateInitJob, IngestionInitTask, IngestionUpdateFinalizeJob, IngestionUpdateFinalizeTask>
{
  /* eslint-enable @typescript-eslint/brace-style */
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(TileMergeTaskManager) private readonly taskBuilder: TileMergeTaskManager,
    @inject(SERVICES.QUEUE_CLIENT) protected queueClient: QueueClient,
    @inject(CatalogClient) private readonly catalogClient: CatalogClient,
    @inject(SeedingJobCreator) private readonly seedingJobCreator: SeedingJobCreator,
    @inject(JobTrackerClient) jobTrackerClient: JobTrackerClient,
    private readonly taskMetrics: TaskMetrics
  ) {
    super(logger, queueClient, jobTrackerClient);
  }

  public async handleJobInit(job: IngestionUpdateInitJob, task: IngestionInitTask): Promise<void> {
    await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${UpdateJobHandler.name}.${this.handleJobInit.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();

      const logger = this.logger.child({ jobId: job.id, taskId: task.id, jobType: job.type });
      const taskProcessTracking = this.taskMetrics.trackTaskProcessing(job.type, task.type);

      try {
        const { inputFiles, partsData, additionalParams, metadata } = job.parameters;

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
          partsData,
        };

        logger.info({ msg: 'building tasks' });
        const mergeTasks = this.taskBuilder.buildTasks(taskBuildParams);

        await this.taskBuilder.pushTasks(job.id, job.type, mergeTasks);

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

          const { updatedInCatalog } = finalizeTaskParams;
          const layerName = this.validateAndGenerateLayerName(job);
          activeSpan?.addEvent('layerNameFormat.valid', { layerName });

          if (!updatedInCatalog) {
            logger.info({ msg: 'Updating layer in catalog', catalogId: job.internalId });
            await this.catalogClient.update(job);
            finalizeTaskParams = await this.markFinalizeStepAsCompleted(job.id, task.id, finalizeTaskParams, 'updatedInCatalog');
            activeSpan?.addEvent('updateCatalog.success', { ...finalizeTaskParams });
          }

          if (this.isAllStepsCompleted(finalizeTaskParams)) {
            logger.info({ msg: 'All finalize steps completed successfully', ...finalizeTaskParams });
            await this.completeTask(job, task, { taskTracker: taskProcessTracking, tracingSpan: activeSpan });

            activeSpan?.addEvent('createSeedingJob.start', { seedMode: SeedMode.SEED, layerName });
            await this.seedingJobCreator.create({ mode: SeedMode.SEED, layerName, ingestionJob: job });
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
