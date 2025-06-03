import type { Logger } from '@map-colonies/js-logger';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import type { IngestionUpdateFinalizeTaskParams, PolygonPartsEntityName } from '@map-colonies/raster-shared';
import type { Tracer } from '@opentelemetry/api';
import { context, trace } from '@opentelemetry/api';
import { inject, injectable } from 'tsyringe';
import { INJECTION_VALUES, SERVICES } from '../../../common/constants';
import type { IConfig, IJobHandler, MergeLowResolutionTilesTaskParams, MergeTilesTaskParams } from '../../../common/interfaces';
import { Grid } from '../../../common/interfaces';
import { CatalogClient } from '../../../httpClients/catalogClient';
import { JobTrackerClient } from '../../../httpClients/jobTrackerClient';
import { TileMergeTaskManager } from '../../../task/models/tileMergeTaskManager';
import type { IngestionJobTypes } from '../../../utils/configUtil';
import { TaskMetrics } from '../../../utils/metrics/taskMetrics';
import {
  type IngestionInitTask,
  ingestionNewFinalizeJobSchema,
  type IngestionUpdateFinalizeJob,
  type IngestionUpdateFinalizeTask,
  type IngestionUpdateInitJob,
  type IngestionNewFinalizeJob,
} from '../../../utils/zod/schemas/job.schema';
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
    @inject(SERVICES.CONFIG) protected readonly config: IConfig,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    @inject(TileMergeTaskManager) private readonly taskBuilder: TileMergeTaskManager,
    @inject(SERVICES.QUEUE_CLIENT) protected queueClient: QueueClient,
    @inject(CatalogClient) private readonly catalogClient: CatalogClient,
    @inject(SeedingJobCreator) private readonly seedingJobCreator: SeedingJobCreator,
    @inject(JobTrackerClient) jobTrackerClient: JobTrackerClient,
    @inject(INJECTION_VALUES.ingestionJobTypes) private readonly ingestionJobTypes: IngestionJobTypes,
    private readonly taskMetrics: TaskMetrics
  ) {
    super(logger, config, queueClient, jobTrackerClient);
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

        const polygonPartsEntityName = await this.getPolygonPartsEntityName(job.resourceId);

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

        const lowResolutionTaskBuildParams: MergeLowResolutionTilesTaskParams = {
          inputFiles,
          taskMetadata: {
            layerRelativePath: `${job.internalId}/${additionalParams.displayPath}`,
            tileOutputFormat: additionalParams.tileOutputFormat,
            isNewTarget: false,
            grid: Grid.TWO_ON_ONE,
          },
          partsData,
          polygonPartsEntityName,
        };

        // TODO: push additional tasks
        const lowResolutionMergeTasks = this.taskBuilder.buildLowResolutionTasks(lowResolutionTaskBuildParams);
        await this.taskBuilder.pushTasks(job.id, job.type, lowResolutionMergeTasks);

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

  // TODO: extract the type of resourceId in input param instead of using IngestionNewFinalizeJob['resourceId']
  private async getPolygonPartsEntityName(resourceId: IngestionNewFinalizeJob['resourceId']): Promise<PolygonPartsEntityName> {
    // polygon parts entity name is retrieved from an Ingestion_New job since it stores this value
    const filteredIngestionNewJobs = await this.queueClient.jobManagerClient.getJobs({
      resourceId,
      type: this.ingestionJobTypes.Ingestion_New,
    });
    // eslint-disable-next-line no-useless-catch
    try {
      const ingestionNewFinalizeJobs = ingestionNewFinalizeJobSchema.array().parse(filteredIngestionNewJobs);
      const polygonPartsEntityName = ingestionNewFinalizeJobs.at(0)?.parameters.additionalParams.polygonPartsEntityName;
      if (polygonPartsEntityName === undefined) {
        throw new Error(); // TODO: handle error
      }
      return polygonPartsEntityName;
    } catch (error) {
      throw error;
    }
    // const polygonPartsEntityName = ingestionNewFinalizeJobs.at(0)?.parameters.additionalParams.polygonPartsEntityName;
    // if (polygonPartsEntityName === undefined) {
    //   throw new Error(); // TODO: handle error
    // }
    // return polygonPartsEntityName;
  }
}
