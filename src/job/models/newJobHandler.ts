import { randomUUID } from 'crypto';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IJobResponse } from '@map-colonies/mc-priority-queue';
import { TilesMimeFormat, lookup as mimeLookup } from '@map-colonies/types';
import { NewRasterLayer, NewRasterLayerMetadata } from '@map-colonies/mc-model-types';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { Grid, IJobHandler, MergeTilesTaskParams, ExtendedRasterLayerMetadata } from '../../common/interfaces';
import { SERVICES } from '../../common/constants';
import { getTileOutputFormat } from '../../utils/imageFormatUtil';
import { TileMergeTaskManager } from '../../task/models/tileMergeTaskManager';
import { LogContext } from '../../common/logging';

@injectable()
export class NewJobHandler implements IJobHandler {
  private readonly logContext: LogContext;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(TileMergeTaskManager) private readonly taskBuilder: TileMergeTaskManager,
    @inject(SERVICES.QUEUE_CLIENT) private readonly queueClient: QueueClient
  ) {
    this.logContext = {
      fileName: __filename,
      class: NewJobHandler.name,
    };
  }

  public async handleJobInit(job: IJobResponse<NewRasterLayer, unknown>, taskId: string): Promise<void> {
    const metadata = { jobId: job.id, jobType: job.type, taskId };
    const logger = this.logger.child({
      metadata,
      logContext: { ...this.logContext, function: this.handleJobInit.name },
    });
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
        partData,
      };

      logger.info({ msg: 'building tasks' });
      const mergeTasks = this.taskBuilder.buildTasks(taskBuildParams);

      logger.info({ msg: 'pushing tasks' });
      await this.taskBuilder.pushTasks(job.id, mergeTasks);

      logger.info({ msg: 'Updating job with new metadata', metadata: { ...metadata, extendedLayerMetadata } });
      await this.queueClient.jobManagerClient.updateJob(job.id, { parameters: { metadata: extendedLayerMetadata, partData, inputFiles } });

      logger.info({ msg: 'Acking task' });
      await this.queueClient.ack(job.id, taskId);

      logger.info({ msg: 'Job init completed successfully' });
    } catch (err) {
      if (err instanceof Error) {
        logger.error({ msg: 'Failed to handle job init', error: err, logContext: { ...this.logContext, function: this.handleJobInit.name } });
        await this.queueClient.reject(job.id, taskId, true, err.message);
        console.log('excellent');
      }
    }
  }

  public async handleJobFinalize(job: IJobResponse<NewRasterLayer, unknown>, taskId: string): Promise<void> {
    const logger = this.logger.child({ jobId: job.id, taskId, logContext: { ...this.logContext, function: this.handleJobFinalize.name } });
    logger.info({ msg: `handling ${job.type} job with "finalize"` });
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
