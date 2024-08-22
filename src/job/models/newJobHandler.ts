import { randomUUID } from 'crypto';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IJobResponse } from '@map-colonies/mc-priority-queue';
import { TilesMimeFormat, lookup as mimeLookup } from '@map-colonies/types';
import { NewRasterLayer, NewRasterLayerMetadata } from '@map-colonies/mc-model-types';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { Grid, IJobHandler, LogContext, MergeTilesTaskParams, OverseerNewRasterLayerMetadata } from '../../common/interfaces';
import { SERVICES } from '../../common/constants';
import { getTileOutputFormat } from '../../utils/imageFormatUtil';
import { MergeTilesTaskBuilder } from '../../task/models/mergeTilesTaskBuilder';

@injectable()
export class NewJobHandler implements IJobHandler {
  private readonly logContext: LogContext;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(MergeTilesTaskBuilder) private readonly taskBuilder: MergeTilesTaskBuilder,
    @inject(SERVICES.QUEUE_CLIENT) private readonly queueClient: QueueClient
  ) {
    this.logContext = {
      fileName: __filename,
      class: NewJobHandler.name,
    };
  }

  public async handleJobInit(job: IJobResponse<NewRasterLayer, unknown>, taskId: string): Promise<void> {
    try {
      const logger = this.logger.child({ jobId: job.id, taskId, logContext: { ...this.logContext, function: this.handleJobInit.name } });
      logger.info({ msg: `Handling ${job.type} job with "init" task`, metadata: { job } });

      const { inputFiles, metadata, partData } = job.parameters;
      const overseerLayerMetadata = this.mapToOverseerNewLayerMetadata(metadata);

      this.logger.info({ msg: 'Updating job with new metadata', metadata: { job, overseerLayerMetadata } });
      await this.queueClient.jobManagerClient.updateJob(job.id, { parameters: { metadata: overseerLayerMetadata, partData, inputFiles } });

      const buildTasksParams: MergeTilesTaskParams = {
        inputFiles,
        taskMetadata: {
          layerRelativePath: overseerLayerMetadata.layerRelativePath,
          tileOutputFormat: overseerLayerMetadata.tileOutputFormat,
          isNewTarget: true,
          grid: overseerLayerMetadata.grid,
        },
        partData,
      };

      logger.info({ msg: 'Building tasks', metadata: { buildTasksParams } });
      const mergeTasks = this.taskBuilder.buildTasks(buildTasksParams);

      logger.info({ msg: 'Pushing tasks', metadata: { mergeTasks } });
      await this.taskBuilder.pushTasks(job.id, taskId, mergeTasks);

      await this.queueClient.ack(job.id, taskId);

      logger.info({ msg: 'Job init completed successfully' });
    } catch (err) {
      if (err instanceof Error) {
        this.logger.error({ msg: 'Failed to handle job init', error: err, logContext: { ...this.logContext, function: this.handleJobInit.name } });
        await this.queueClient.reject(job.id, taskId, true, err.message);
      }
    }
  }

  public async handleJobFinalize(job: IJobResponse<NewRasterLayer, unknown>, taskId: string): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.handleJobFinalize.name };
    this.logger.info({ msg: `handling ${job.type} job with "finalize"`, metadata: { job }, logContext: logCtx });
    await Promise.reject('not implemented');
  }

  private readonly mapToOverseerNewLayerMetadata = (metadata: NewRasterLayerMetadata): OverseerNewRasterLayerMetadata => {
    const id = randomUUID();
    const displayPath = randomUUID();
    const layerRelativePath = `${id}/${displayPath}`;
    const tileOutputFormat = getTileOutputFormat(metadata.transparency);
    const tileMimeType = mimeLookup(tileOutputFormat) as TilesMimeFormat;
    const grid = Grid.TWO_ON_ONE;

    return {
      ...metadata,
      id,
      displayPath,
      layerRelativePath,
      tileOutputFormat,
      tileMimeType,
      grid,
    };
  };
}
