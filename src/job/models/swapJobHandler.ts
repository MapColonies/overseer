import { randomUUID } from 'crypto';
import { inject, injectable } from 'tsyringe';
import type { Logger } from '@map-colonies/js-logger';
import { context, trace } from '@opentelemetry/api';
import type { Tracer } from '@opentelemetry/api';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import type { IngestionSwapUpdateFinalizeTaskParams } from '@map-colonies/raster-shared';
import type { IJobHandler, MergeTilesTaskParams } from '../../common/interfaces';
import { Grid } from '../../common/interfaces';
import type {
  IngestionInitTask,
  IngestionSwapUpdateFinalizeJob,
  IngestionSwapUpdateFinalizeTask,
  IngestionSwapUpdateInitJob,
} from '../../utils/zod/schemas/job.schema';
import { MapproxyApiClient } from '../../httpClients/mapproxyClient';
import { TileMergeTaskManager } from '../../task/models/tileMergeTaskManager';
import { CatalogClient } from '../../httpClients/catalogClient';
import { TaskMetrics } from '../../utils/metrics/taskMetrics';
import { SeedMode, SERVICES } from '../../common/constants';
import { JobHandler } from './jobHandler';
import { SeedingJobCreator } from './seedingJobCreator';

@injectable()
/* eslint-disable @typescript-eslint/brace-style */
export class SwapJobHandler
  extends JobHandler
  implements IJobHandler<IngestionSwapUpdateInitJob, IngestionInitTask, IngestionSwapUpdateFinalizeJob, IngestionSwapUpdateFinalizeTask>
{
  /* eslint-enable @typescript-eslint/brace-style */
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.TRACER) private readonly tracer: Tracer,
    @inject(SERVICES.QUEUE_CLIENT) protected queueClient: QueueClient,
    @inject(TileMergeTaskManager) private readonly taskBuilder: TileMergeTaskManager,
    @inject(MapproxyApiClient) private readonly mapproxyClient: MapproxyApiClient,
    @inject(CatalogClient) private readonly catalogClient: CatalogClient,
    @inject(SeedingJobCreator) private readonly seedingJobCreator: SeedingJobCreator,
    private readonly taskMetrics: TaskMetrics
  ) {
    super(logger, queueClient);
  }

  public async handleJobInit(job: IngestionSwapUpdateInitJob, task: IngestionInitTask): Promise<void> {
    await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${SwapJobHandler.name}.${this.handleJobInit.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();

      const logger = this.logger.child({ jobId: job.id, taskId: task.id, jobType: job.type });
      const taskProcessTracking = this.taskMetrics.trackTaskProcessing(job.type, task.type);

      try {
        logger.info({ msg: `handling ${job.type} job with ${task.type} task` });
        const { inputFiles, partsData, additionalParams, metadata } = job.parameters;

        activeSpan?.setAttributes({ ...metadata });

        activeSpan?.addEvent('validateAdditionalParams.success');

        const displayPath = randomUUID();

        activeSpan?.addEvent('generateDisplayPath.success', { displayPath });

        const taskBuildParams: MergeTilesTaskParams = {
          inputFiles,
          partsData,
          taskMetadata: {
            tileOutputFormat: additionalParams.tileOutputFormat,
            isNewTarget: true,
            layerRelativePath: `${job.internalId}/${displayPath}`,
            grid: Grid.TWO_ON_ONE,
          },
        };

        logger.info({ msg: 'building tasks' });
        const mergeTasks = this.taskBuilder.buildTasks(taskBuildParams);

        await this.taskBuilder.pushTasks(job.id, job.type, mergeTasks);

        await this.completeInitTask(job, task, { taskTracker: taskProcessTracking, tracingSpan: activeSpan });

        await this.updateJobAdditionalParams(job, additionalParams, displayPath);
        activeSpan?.addEvent('updateJobAdditionalParams.success', { displayPath });
      } catch (err) {
        await this.handleError(err, job, task, { taskTracker: taskProcessTracking, tracingSpan: activeSpan });
      } finally {
        activeSpan?.end();
      }
    });
  }

  public async handleJobFinalize(job: IngestionSwapUpdateFinalizeJob, task: IngestionSwapUpdateFinalizeTask): Promise<void> {
    await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${SwapJobHandler.name}.${this.handleJobFinalize.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();
      const logger = this.logger.child({ jobId: job.id, taskId: task.id, jobType: job.type, taskType: task.type });
      const taskProcessTracking = this.taskMetrics.trackTaskProcessing(job.type, task.type);

      try {
        logger.info({ msg: `handling ${job.type} job with ${task.type} task` });
        let finalizeTaskParams: IngestionSwapUpdateFinalizeTaskParams = task.parameters;
        activeSpan?.addEvent(`${job.type}.${task.type}.start`, { ...finalizeTaskParams });

        const { updatedInCatalog, updatedInMapproxy } = finalizeTaskParams;
        const layerName = this.validateAndGenerateLayerName(job);
        activeSpan?.addEvent('layerNameFormat.valid', { layerName });

        const { tileOutputFormat, displayPath } = job.parameters.additionalParams;

        if (!updatedInMapproxy) {
          const layerRelativePath = `${job.internalId}/${displayPath}`;
          logger.info({ msg: 'Updating layer in mapproxy', layerName, layerRelativePath, tileOutputFormat });
          await this.mapproxyClient.update(layerName, layerRelativePath, tileOutputFormat);
          finalizeTaskParams = await this.markFinalizeStepAsCompleted(job.id, task.id, finalizeTaskParams, 'updatedInMapproxy');
          activeSpan?.addEvent('updateMapproxy.success', { ...finalizeTaskParams });
        }

        if (!updatedInCatalog) {
          logger.info({ msg: 'Updating layer in catalog', displayPath });
          await this.catalogClient.update(job);
          finalizeTaskParams = await this.markFinalizeStepAsCompleted(job.id, task.id, finalizeTaskParams, 'updatedInCatalog');
          activeSpan?.addEvent('updateCatalog.success', { ...finalizeTaskParams });
        }

        if (this.isAllStepsCompleted(finalizeTaskParams)) {
          logger.info({ msg: 'All finalize steps completed successfully', ...finalizeTaskParams });
          await this.completeTaskAndJob(job, task, { taskTracker: taskProcessTracking, tracingSpan: activeSpan });

          activeSpan?.addEvent('createSeedingJob.start', { layerName, seedMode: SeedMode.CLEAN });
          await this.seedingJobCreator.create({ mode: SeedMode.CLEAN, layerName, ingestionJob: job });
        }
      } catch (err) {
        await this.handleError(err, job, task, { taskTracker: taskProcessTracking, tracingSpan: activeSpan });
      } finally {
        activeSpan?.end();
      }
    });
  }

  private async updateJobAdditionalParams(
    job: IngestionSwapUpdateInitJob,
    additionalParams: Record<string, unknown>,
    displayPath: string
  ): Promise<void> {
    const newAdditionalParams = { ...additionalParams, displayPath };
    this.logger.info({ msg: 'Updating job additional params with new displayPath', jobId: job.id, newAdditionalParams });
    return this.queueClient.jobManagerClient.updateJob(job.id, {
      parameters: { ...job.parameters, additionalParams: newAdditionalParams },
    });
  }
}
