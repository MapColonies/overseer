import { randomUUID } from 'crypto';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IJobResponse, ITaskResponse, OperationStatus } from '@map-colonies/mc-priority-queue';
import { TilesMimeFormat, lookup as mimeLookup } from '@map-colonies/types';
import { IngestionNewFinalizeTaskParams, IngestionNewJobParams, NewRasterLayerMetadata } from '@map-colonies/mc-model-types';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { newAdditionalParamsSchema } from '../../utils/zod/schemas/jobParametersSchema';
import { Grid, IJobHandler, MergeTilesTaskParams, ExtendedRasterLayerMetadata, ExtendedNewRasterLayer } from '../../common/interfaces';
import { SERVICES } from '../../common/constants';
import { getTileOutputFormat } from '../../utils/imageFormatUtil';
import { TileMergeTaskManager } from '../../task/models/tileMergeTaskManager';
import { MapproxyApiClient } from '../../httpClients/mapproxyClient';
import { GeoserverClient } from '../../httpClients/geoserverClient';
import { CatalogClient } from '../../httpClients/catalogClient';
import { JobHandler } from './jobHandler';

@injectable()
export class NewJobHandler extends JobHandler implements IJobHandler {
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(TileMergeTaskManager) private readonly taskBuilder: TileMergeTaskManager,
    @inject(SERVICES.QUEUE_CLIENT) queueClient: QueueClient,
    @inject(CatalogClient) private readonly catalogClient: CatalogClient,
    @inject(MapproxyApiClient) private readonly mapproxyClient: MapproxyApiClient,
    @inject(GeoserverClient) private readonly geoserverClient: GeoserverClient
  ) {
    super(logger, queueClient);
  }

  public async handleJobInit(job: IJobResponse<IngestionNewJobParams, unknown>, taskId: string): Promise<void> {
    const logger = this.logger.child({ jobId: job.id, jobType: job.type, taskId });
    try {
      logger.info({ msg: `handling ${job.type} job with "init" task` });

      const { inputFiles, metadata, partsData, additionalParams } = job.parameters;
      const validAdditionalParams = this.validateAdditionalParams(additionalParams, newAdditionalParamsSchema);
      const extendedLayerMetadata = this.mapToExtendedNewLayerMetadata(metadata);

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

      logger.info({ msg: 'pushing tasks' });
      await this.taskBuilder.pushTasks(job.id, mergeTasks);

      logger.info({ msg: 'Updating job with new metadata', ...metadata, extendedLayerMetadata });
      await this.queueClient.jobManagerClient.updateJob(job.id, {
        internalId: extendedLayerMetadata.catalogId,
        parameters: { metadata: extendedLayerMetadata, partsData, inputFiles, additionalParams: validAdditionalParams },
      });

      logger.info({ msg: 'Acking task' });
      await this.queueClient.ack(job.id, taskId);

      logger.info({ msg: 'Job init completed successfully' });
    } catch (err) {
      if (err instanceof Error) {
        logger.error({ msg: 'Failed to handle job init', error: err });
        await this.queueClient.reject(job.id, taskId, true, err.message);
      }
    }
  }

  public async handleJobFinalize(
    job: IJobResponse<ExtendedNewRasterLayer, unknown>,
    task: ITaskResponse<IngestionNewFinalizeTaskParams>
  ): Promise<void> {
    const logger = this.logger.child({ jobId: job.id, taskId: task.id });

    try {
      logger.info({ msg: `handling ${job.type} job with "finalize"` });

      let finalizeTaskParams: IngestionNewFinalizeTaskParams = task.parameters;
      const { insertedToMapproxy, insertedToGeoServer, insertedToCatalog } = finalizeTaskParams;
      const { layerRelativePath, tileOutputFormat } = job.parameters.metadata;
      const layerName = this.validateAndGenerateLayerName(job);

      if (!insertedToMapproxy) {
        logger.info({ msg: 'publishing to mapproxy', layerName, layerRelativePath, tileOutputFormat });
        await this.mapproxyClient.publish(layerName, layerRelativePath, tileOutputFormat);
        finalizeTaskParams = await this.markFinalizeStepAsCompleted(job.id, task.id, finalizeTaskParams, 'insertedToMapproxy');
      }

      if (!insertedToGeoServer) {
        const geoserverLayerName = layerName.toLowerCase();
        logger.info({ msg: 'publishing to geoserver', geoserverLayerName });
        await this.geoserverClient.publish(geoserverLayerName);
        finalizeTaskParams = await this.markFinalizeStepAsCompleted(job.id, task.id, finalizeTaskParams, 'insertedToGeoServer');
      }

      if (!insertedToCatalog) {
        logger.info({ msg: 'publishing to catalog', layerName });
        await this.catalogClient.publish(job, layerName);
        finalizeTaskParams = await this.markFinalizeStepAsCompleted(job.id, task.id, finalizeTaskParams, 'insertedToCatalog');
      }

      if (this.isAllStepsCompleted(finalizeTaskParams)) {
        logger.info({ msg: 'All finalize steps completed successfully', ...finalizeTaskParams });
        await this.queueClient.ack(job.id, task.id);
        await this.queueClient.jobManagerClient.updateJob(job.id, { status: OperationStatus.COMPLETED, reason: 'Job completed successfully' });
      }
    } catch (err) {
      if (err instanceof Error) {
        const errorMsg = `Failed to handle job finalize: ${err.message}`;
        logger.error({ msg: errorMsg, error: err });
        await this.queueClient.reject(job.id, task.id, true, err.message);
      }
    }
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
