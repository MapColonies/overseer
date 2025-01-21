import { randomUUID } from 'crypto';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { context, trace, Tracer } from '@opentelemetry/api';
import { IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import { TilesMimeFormat, lookup as mimeLookup } from '@map-colonies/types';
import { IngestionNewFinalizeTaskParams, IngestionNewJobParams, NewRasterLayerMetadata } from '@map-colonies/mc-model-types';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { newAdditionalParamsSchema } from '../../utils/zod/schemas/jobParametersSchema';
import { Grid, IJobHandler, MergeTilesTaskParams, ExtendedRasterLayerMetadata, ExtendedNewRasterLayer } from '../../common/interfaces';
import { TaskMetrics } from '../../utils/metrics/taskMetrics';
import { SERVICES } from '../../common/constants';
import { getTileOutputFormat } from '../../utils/imageFormatUtil';
import { TileMergeTaskManager } from '../../task/models/tileMergeTaskManager';
import { MapproxyApiClient } from '../../httpClients/mapproxyClient';
import { GeoserverClient } from '../../httpClients/geoserverClient';
import { CatalogClient } from '../../httpClients/catalogClient';
import { JobHandler } from './jobHandler';

@injectable()
/* eslint-disable @typescript-eslint/brace-style */
export class NewJobHandler
  extends JobHandler
  implements IJobHandler<IngestionNewJobParams, unknown, ExtendedNewRasterLayer, IngestionNewFinalizeTaskParams>
{
  /* eslint-enable @typescript-eslint/brace-style */
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    @inject(TileMergeTaskManager) private readonly taskBuilder: TileMergeTaskManager,
    @inject(SERVICES.QUEUE_CLIENT) queueClient: QueueClient,
    @inject(CatalogClient) private readonly catalogClient: CatalogClient,
    @inject(MapproxyApiClient) private readonly mapproxyClient: MapproxyApiClient,
    @inject(GeoserverClient) private readonly geoserverClient: GeoserverClient,
    private readonly taskMetrics: TaskMetrics
  ) {
    super(logger, queueClient);
  }

  public async handleJobInit(job: IJobResponse<IngestionNewJobParams, unknown>, task: ITaskResponse<unknown>): Promise<void> {
    await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${NewJobHandler.name}.${this.handleJobInit.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();
      const logger = this.logger.child({ jobId: job.id, jobType: job.type, taskId: task.id });
      const taskProcessTracking = this.taskMetrics.trackTaskProcessing(job.type, task.type);
      try {
        logger.info({ msg: `handling ${job.type} job with ${task.type} task` });

        const { inputFiles, metadata, partsData, additionalParams } = job.parameters;

        const validAdditionalParams = this.validateAdditionalParams(additionalParams, newAdditionalParamsSchema);
        activeSpan?.addEvent('validateAdditionalParams.valid');

        const extendedLayerMetadata = this.mapToExtendedNewLayerMetadata(metadata);
        activeSpan?.setAttributes({ ...extendedLayerMetadata });

        const taskBuildParams: MergeTilesTaskParams = {
          inputFiles,
          taskMetadata: {
            layerRelativePath: extendedLayerMetadata.layerRelativePath,
            tileOutputFormat: extendedLayerMetadata.tileOutputFormat,
            isNewTarget: true,
            grid: extendedLayerMetadata.grid,
          },
          partsData,
        };

        logger.info({ msg: 'building tasks' });
        const mergeTasks = this.taskBuilder.buildTasks(taskBuildParams);

        await this.taskBuilder.pushTasks(job.id, job.type, mergeTasks);

        logger.info({ msg: 'Updating job with new metadata', ...metadata, extendedLayerMetadata });
        await this.queueClient.jobManagerClient.updateJob(job.id, {
          internalId: extendedLayerMetadata.catalogId,
          parameters: { metadata: extendedLayerMetadata, partsData, inputFiles, additionalParams: validAdditionalParams },
        });
        activeSpan?.addEvent('updateJob.completed', { ...extendedLayerMetadata });

        await this.completeInitTask(job, task, { taskTracker: taskProcessTracking, tracingSpan: activeSpan });
      } catch (err) {
        await this.handleError(err, job, task, { taskTracker: taskProcessTracking, tracingSpan: activeSpan });
      } finally {
        activeSpan?.end();
      }
    });
  }

  public async handleJobFinalize(
    job: IJobResponse<ExtendedNewRasterLayer, unknown>,
    task: ITaskResponse<IngestionNewFinalizeTaskParams>
  ): Promise<void> {
    await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${NewJobHandler.name}.${this.handleJobFinalize.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();

      const logger = this.logger.child({ jobId: job.id, taskId: task.id });
      const taskProcessTracking = this.taskMetrics.trackTaskProcessing(job.type, task.type);

      try {
        logger.info({ msg: `handling ${job.type} job with ${task.type}` });

        let finalizeTaskParams: IngestionNewFinalizeTaskParams = task.parameters;
        activeSpan?.addEvent(`${job.type}.${task.type}.start`, { ...finalizeTaskParams });
        const { insertedToMapproxy, insertedToGeoServer, insertedToCatalog } = finalizeTaskParams;
        const { layerRelativePath, tileOutputFormat } = job.parameters.metadata;
        const layerNameFormats = this.validateAndGenerateLayerNameFormats(job);
        activeSpan?.addEvent('layerNameFormats.valid', { ...layerNameFormats });

        if (!insertedToMapproxy) {
          const layerName = layerNameFormats.layerName;
          logger.info({ msg: 'publishing to mapproxy', layerName, layerRelativePath, tileOutputFormat });
          await this.mapproxyClient.publish(layerName, layerRelativePath, tileOutputFormat);
          finalizeTaskParams = await this.markFinalizeStepAsCompleted(job.id, task.id, finalizeTaskParams, 'insertedToMapproxy');
          activeSpan?.addEvent('publishToMapproxy.success', { ...finalizeTaskParams });
        }

        if (!insertedToGeoServer) {
          logger.info({ msg: 'publishing to geoserver', layerNameFormats });
          await this.geoserverClient.publish(layerNameFormats);
          finalizeTaskParams = await this.markFinalizeStepAsCompleted(job.id, task.id, finalizeTaskParams, 'insertedToGeoServer');
          activeSpan?.addEvent('publishToGeoServer.success', { ...finalizeTaskParams });
        }

        if (!insertedToCatalog) {
          const layerName = layerNameFormats.layerName;
          logger.info({ msg: 'publishing to catalog', layerName });
          await this.catalogClient.publish(job, layerName);
          finalizeTaskParams = await this.markFinalizeStepAsCompleted(job.id, task.id, finalizeTaskParams, 'insertedToCatalog');
          activeSpan?.addEvent('publishToCatalog.success', { ...finalizeTaskParams });
        }

        if (this.isAllStepsCompleted(finalizeTaskParams)) {
          logger.info({ msg: 'All finalize steps completed successfully', ...finalizeTaskParams });
          await this.completeTaskAndJob(job, task, { taskTracker: taskProcessTracking, tracingSpan: activeSpan });
        }
      } catch (err) {
        await this.handleError(err, job, task, { taskTracker: taskProcessTracking });
      } finally {
        activeSpan?.end();
      }
    });
  }

  private readonly mapToExtendedNewLayerMetadata = (metadata: NewRasterLayerMetadata): ExtendedRasterLayerMetadata => {
    const catalogId = randomUUID();
    const displayPath = randomUUID();
    const layerRelativePath = `${catalogId}/${displayPath}`;
    const tileOutputFormat = getTileOutputFormat(metadata.transparency);
    const tileMimeType = mimeLookup(tileOutputFormat) as TilesMimeFormat;
    const grid = Grid.TWO_ON_ONE;

    return {
      ...metadata,
      catalogId,
      displayPath,
      layerRelativePath,
      tileOutputFormat,
      tileMimeType,
      grid,
    };
  };
}
