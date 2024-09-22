import { randomUUID } from 'crypto';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IJobResponse, ITaskResponse } from '@map-colonies/mc-priority-queue';
import { TilesMimeFormat, lookup as mimeLookup } from '@map-colonies/types';
import { NewRasterLayer, NewRasterLayerMetadata } from '@map-colonies/mc-model-types';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { Grid, IJobHandler, MergeTilesTaskParams, ExtendedRasterLayerMetadata, FinalizeTaskParams } from '../../common/interfaces';
import { SERVICES } from '../../common/constants';
import { getTileOutputFormat } from '../../utils/imageFormatUtil';
import { TileMergeTaskManager } from '../../task/models/tileMergeTaskManager';

@injectable()
export class NewJobHandler implements IJobHandler {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(TileMergeTaskManager) private readonly taskBuilder: TileMergeTaskManager,
    @inject(SERVICES.QUEUE_CLIENT) private readonly queueClient: QueueClient
  ) {}

  public async handleJobInit(job: IJobResponse<NewRasterLayer, unknown>, taskId: string): Promise<void> {
    const logger = this.logger.child({ jobId: job.id, jobType: job.type, taskId });
    try {
      logger.info({ msg: `handling ${job.type} job with "init" task` });

      const { inputFiles, metadata, partData } = job.parameters;
      const extendedLayerMetadata = this.mapToExtendedNewLayerMetadata(metadata);

      const taskBuildParams: MergeTilesTaskParams = {
        inputFiles,
        taskMetadata: {
          layerRelativePath: extendedLayerMetadata.layerRelativePath,
          tileOutputFormat: extendedLayerMetadata.tileOutputFormat,
          isNewTarget: true,
          grid: extendedLayerMetadata.grid,
        },
        partsData: partData,
      };

      logger.info({ msg: 'building tasks' });
      const mergeTasks = this.taskBuilder.buildTasks(taskBuildParams);

      logger.info({ msg: 'pushing tasks' });
      await this.taskBuilder.pushTasks(job.id, mergeTasks);

      logger.info({ msg: 'Updating job with new metadata', ...metadata, extendedLayerMetadata });
      await this.queueClient.jobManagerClient.updateJob(job.id, { parameters: { metadata: extendedLayerMetadata, partData, inputFiles } });

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

  public async handleJobFinalize(job: IJobResponse<NewRasterLayer, unknown>, task: ITaskResponse<FinalizeTaskParams>): Promise<void> {
    const logger = this.logger.child({ jobId: job.id, taskId: task.id });

    try {
      logger.info({ msg: `handling ${job.type} job with "finalize"` });
      let updateTaskParams: FinalizeTaskParams = task.parameters;
      const { insertedToMapproxy, insertedToGeoServer, insertedToCatalog } = updateTaskParams;

      if (!insertedToMapproxy) {
        updateTaskParams = { ...updateTaskParams, insertedToMapproxy: true };
        await this.queueClient.jobManagerClient.updateTask(job.id, task.id, { parameters: updateTaskParams });
      }

      if (!insertedToGeoServer) {
        updateTaskParams = { ...updateTaskParams, insertedToGeoServer: true };
        await this.queueClient.jobManagerClient.updateTask(job.id, task.id, { parameters: updateTaskParams });
      }

      if (!insertedToCatalog) {
        updateTaskParams = { ...updateTaskParams, insertedToCatalog: true };
        await this.queueClient.jobManagerClient.updateTask(job.id, task.id, { parameters: { ...task.parameters, insertedToCatalog: true } });
      }
    } catch (err) {}

    await Promise.reject('not implemented');
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
