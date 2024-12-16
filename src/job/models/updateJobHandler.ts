import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { TaskHandler as QueueClient, IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import { IngestionUpdateFinalizeTaskParams, IngestionUpdateJobParams } from '@map-colonies/mc-model-types';
import { CatalogClient } from '../../httpClients/catalogClient';
import { Grid, IConfig, IJobHandler, MergeTilesTaskParams } from '../../common/interfaces';
import { SeedMode, SERVICES } from '../../common/constants';
import { TaskMetrics } from '../../utils/metrics/taskMetrics';
import { updateAdditionalParamsSchema } from '../../utils/zod/schemas/jobParametersSchema';
import { TileMergeTaskManager } from '../../task/models/tileMergeTaskManager';
import { JobHandler } from './jobHandler';
import { SeedingJobCreator } from './seedingJobCreator';

@injectable()
export class UpdateJobHandler extends JobHandler implements IJobHandler {
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(TileMergeTaskManager) private readonly taskBuilder: TileMergeTaskManager,
    @inject(SERVICES.QUEUE_CLIENT) protected queueClient: QueueClient,
    @inject(CatalogClient) private readonly catalogClient: CatalogClient,
    @inject(SeedingJobCreator) private readonly seedingJobCreator: SeedingJobCreator,
    private readonly taskMetrics: TaskMetrics
  ) {
    super(logger, queueClient);
  }

  public async handleJobInit(job: IJobResponse<IngestionUpdateJobParams, unknown>, task: ITaskResponse<unknown>): Promise<void> {
    const logger = this.logger.child({ jobId: job.id, taskId: task.id, jobType: job.type });
    const taskProcessTracking = this.taskMetrics.trackTaskProcessing(job.type, task.type);

    try {
      logger.info({ msg: `handling ${job.type} job with "init" task` });
      const { inputFiles, partsData, additionalParams } = job.parameters;

      const validAdditionalParams = this.validateAdditionalParams(additionalParams, updateAdditionalParamsSchema);

      const taskBuildParams: MergeTilesTaskParams = {
        inputFiles,
        taskMetadata: {
          layerRelativePath: `${job.internalId}/${validAdditionalParams.displayPath}`,
          tileOutputFormat: validAdditionalParams.tileOutputFormat,
          isNewTarget: false,
          grid: Grid.TWO_ON_ONE,
        },
        partsData,
      };

      logger.info({ msg: 'building tasks' });
      const mergeTasks = this.taskBuilder.buildTasks(taskBuildParams);

      logger.info({ msg: 'pushing tasks' });
      await this.taskBuilder.pushTasks(job.id, job.type, mergeTasks);

      logger.info({ msg: 'Acking task' });
      await this.queueClient.ack(job.id, task.id);
      taskProcessTracking?.success();
    } catch (err) {
      await this.handleError(err, job, task, { taskTracker: taskProcessTracking });
    }
  }

  public async handleJobFinalize(
    job: IJobResponse<IngestionUpdateJobParams, unknown>,
    task: ITaskResponse<IngestionUpdateFinalizeTaskParams>
  ): Promise<void> {
    const logger = this.logger.child({ jobId: job.id, taskId: task.id, jobType: job.type, taskType: task.type });
    const taskProcessTracking = this.taskMetrics.trackTaskProcessing(job.type, task.type);

    try {
      logger.info({ msg: `handling ${job.type} job with ${task.type} task` });
      let finalizeTaskParams: IngestionUpdateFinalizeTaskParams = task.parameters;
      const { updatedInCatalog } = finalizeTaskParams;
      const { layerName } = this.validateAndGenerateLayerNameFormats(job);

      if (!updatedInCatalog) {
        logger.info({ msg: 'Updating layer in catalog', catalogId: job.internalId });
        await this.catalogClient.update(job);
        finalizeTaskParams = await this.markFinalizeStepAsCompleted(job.id, task.id, finalizeTaskParams, 'updatedInCatalog');
      }

      if (this.isAllStepsCompleted(finalizeTaskParams)) {
        logger.info({ msg: 'All finalize steps completed successfully', ...finalizeTaskParams });
        await this.completeTaskAndJob(job, task);
        taskProcessTracking?.success();
        await this.seedingJobCreator.create({ mode: SeedMode.SEED, layerName, ingestionJob: job });
      }
    } catch (err) {
      await this.handleError(err, job, task, { taskTracker: taskProcessTracking });
    }
  }
}
