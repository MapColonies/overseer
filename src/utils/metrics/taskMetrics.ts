import { inject, singleton } from 'tsyringe';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';
import { OperationStatus } from '@map-colonies/mc-priority-queue';
import { SERVICES } from '../../common/constants';
import { IConfig, TaskProcessingTracker } from '../../common/interfaces';

@singleton()
export class TaskMetrics {
  private readonly tasksCreationGauge?: Gauge;
  private readonly batchCreationGauge?: Gauge;
  private readonly taskBucket: number[];
  private readonly tasksProcessedCounter?: Counter;
  private readonly tasksProcessingDuration?: Histogram;
  private readonly tasksSuccessCounter?: Counter;
  private readonly tasksFailureCounter?: Counter;
  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.METRICS) private readonly metricsRegistry?: Registry
  ) {
    this.taskBucket = this.config.get<number[]>('telemetry.metrics.buckets');
    if (this.metricsRegistry) {
      this.tasksProcessedCounter = new Counter({
        name: 'overseer_tasks_processed_total',
        help: 'Total number of tasks processed',
        labelNames: ['jobType', 'taskType'],
        registers: [this.metricsRegistry],
      });

      this.tasksProcessingDuration = new Histogram({
        name: 'overseer_tasks_processing_duration_seconds',
        help: 'Duration of task processing in seconds',
        labelNames: ['jobType', 'taskType', 'status'],
        registers: [this.metricsRegistry],
        buckets: this.taskBucket,
      });

      this.tasksSuccessCounter = new Counter({
        name: 'overseer_tasks_success_total',
        help: 'Counter for the number of tasks that succeeded',
        labelNames: ['jobType', 'taskType'],
        registers: [this.metricsRegistry],
      });

      this.tasksFailureCounter = new Counter({
        name: 'overseer_tasks_failure_total',
        help: 'Number of failed tasks',
        labelNames: ['jobType', 'taskType', 'errorType'],
        registers: [this.metricsRegistry],
      });

      this.batchCreationGauge = new Gauge({
        name: 'overseer_total_tiles_merging_batch_created_per_job',
        help: 'Number of total tiles-merging batch created per job',
        labelNames: ['jobType', 'taskType'],
        registers: [this.metricsRegistry],
      });

      this.tasksCreationGauge = new Gauge({
        name: 'overseer_total_tiles_merging_tasks_created_per_job',
        help: 'Number of current tiles-merging tasks created',
        labelNames: ['jobType', 'taskType'],
        registers: [this.metricsRegistry],
      });
    }
  }

  public trackTaskProcessing(jobType: string, taskType: string): TaskProcessingTracker | undefined {
    const timer = this.tasksProcessingDuration?.startTimer({
      jobType,
      taskType,
    });
    this.tasksProcessedCounter?.inc({ jobType, taskType });

    if (!timer) {
      return undefined;
    }

    return {
      success: (): void => {
        timer({ status: OperationStatus.COMPLETED });
        this.tasksSuccessCounter?.inc({ jobType, taskType });
      },
      failure: (errorType: string): void => {
        timer({ status: OperationStatus.FAILED });
        this.tasksFailureCounter?.inc({ jobType, taskType, errorType });
      },
    };
  }

  public trackTasksEnqueue(jobType: string, taskType: string, batchCount: number): void {
    this.tasksCreationGauge?.labels({ jobType, taskType }).inc();
    this.batchCreationGauge?.labels({ jobType, taskType }).inc(batchCount);
  }

  public resetTrackTasksEnqueue(jobType: string, taskType: string): void {
    this.tasksCreationGauge?.labels({ jobType, taskType }).set(0);
    this.batchCreationGauge?.labels({ jobType, taskType }).set(0);
  }
}
