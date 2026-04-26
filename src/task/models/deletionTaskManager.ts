import { inject, injectable } from "tsyringe";
import { context, SpanStatusCode, trace, Tracer } from "@opentelemetry/api";
import { IConfig } from "config";
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { SERVICES, StorageProvider } from "../../common/constants";
import { TaskMetrics } from "../../utils/metrics/taskMetrics";
import { DeletionTaskParameters } from "../../common/interfaces";
import { IngestionCreateTasksTask } from "../../utils/zod/schemas/job.schema";
import { TaskTypes } from "@map-colonies/raster-shared";


@injectable()
export class TileDeletionTaskManager {
  private readonly tilesStorageProvider: string;
  private readonly tileBatchSize: number;
  private readonly taskBatchSize: number;
  private readonly taskType: string;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.TRACER) private readonly tracer: Tracer,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.QUEUE_CLIENT) private readonly queueClient: QueueClient,
    private readonly taskMetrics: TaskMetrics
  ) {
    this.tilesStorageProvider = this.config.get<StorageProvider>('tilesStorageProvider');
    this.tileBatchSize = this.config.get<number>('jobManagement.ingestion.tasks.tilesMerging.tileBatchSize');
    this.taskBatchSize = this.config.get<number>('jobManagement.ingestion.tasks.tilesMerging.taskBatchSize');
    this.taskType = this.config.get<string>('jobManagement.ingestion.tasks.tilesMerging.type');
  }

  public buildTasks(
    taskBuildParams: DeletionTaskParameters,
    initTask: IngestionCreateTasksTask
  ): AsyncGenerator<
    void,
    void
  > {
    return context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${TileDeletionTaskManager.name}.${this.buildTasks.name}`)), () => {

      validationTask = this.queueClient.jobManagerClient.findTasks({ jobId: initTask.jobId, taskType: TaskTypes})
    });
  }


}