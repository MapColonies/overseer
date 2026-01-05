/* eslint-disable import/exports-last */
/* eslint-disable @typescript-eslint/naming-convention */
import { z } from 'zod';
import {
  createJobResponseSchema,
  createTaskResponseSchema,
  exportJobParametersSchema,
  ingestionNewFinalizeTaskParamsSchema,
  ingestionNewJobParamsSchema,
  ingestionSwapUpdateJobParamsSchema,
  ingestionSwapUpdateTaskParamsSchema,
  ingestionUpdateFinalizeTaskParamsSchema,
  ingestionUpdateJobParamsSchema,
  taskBlockDuplicationParamSchema,
  exportFinalizeTaskParamsSchema,
  rasterProductTypeSchema,
} from '@map-colonies/raster-shared';
import { ingestionNewExtendedJobParamsSchema, internalIdSchema } from './jobParameters.schema';
import {
  ingestionSwapUpdateFinalizeJobParamsSchema,
  ingestionUpdateFinalizeJobParamsSchema,
  extendedTaskBlockDuplicationParamSchema,
} from './jobParameters.schema';

//#region Ingestion
//#region IngestionNew
//mergeTaskCreation
export const ingestionNewCreateMergeTasksJobSchema = createJobResponseSchema(ingestionNewJobParamsSchema)
  .and(internalIdSchema)
  .describe('IngestionNewCreateMergeTasksJobSchema');
export type IngestionNewCreateMergeTasksJob = z.infer<typeof ingestionNewCreateMergeTasksJobSchema>;

export const ingestionCreateMergeTasksTaskSchema = createTaskResponseSchema(extendedTaskBlockDuplicationParamSchema).describe(
  'IngestionNewCreateMergeTasksTaskSchema'
);
export type IngestionCreateMergeTasksTask = z.infer<typeof ingestionCreateMergeTasksTaskSchema>;
//finalize
export const requiredProductNameAndTypeSchema = z.object({
  productName: z.string(),
  productType: rasterProductTypeSchema,
});
export const ingestionNewFinalizeJobSchema = createJobResponseSchema(ingestionNewExtendedJobParamsSchema)
  .and(requiredProductNameAndTypeSchema)
  .describe('IngestionNewFinalizeJobSchema');

export type IngestionNewFinalizeJob = z.infer<typeof ingestionNewFinalizeJobSchema>;

export const ingestionNewFinalizeTaskSchema =
  createTaskResponseSchema(ingestionNewFinalizeTaskParamsSchema).describe('IngestionNewFinalizeTaskSchema');

export type IngestionNewFinalizeTask = z.infer<typeof ingestionNewFinalizeTaskSchema>;
//#endregion

//#region IngestionUpdate
//mergeTaskCreation
export const ingestionUpdateCreateMergeTasksJobSchema = createJobResponseSchema(ingestionUpdateJobParamsSchema).describe(
  'IngestionUpdateCreateMergeTasksJobSchema'
);
export type IngestionUpdateCreateMergeTasksJob = z.infer<typeof ingestionUpdateCreateMergeTasksJobSchema>;

//finalize
export const ingestionUpdateFinalizeJobSchema = createJobResponseSchema(ingestionUpdateFinalizeJobParamsSchema)
  .and(requiredProductNameAndTypeSchema)
  .describe('IngestionUpdateFinalizeJobSchema');
export type IngestionUpdateFinalizeJob = z.infer<typeof ingestionUpdateFinalizeJobSchema>;

export const ingestionUpdateFinalizeTaskSchema = createTaskResponseSchema(ingestionUpdateFinalizeTaskParamsSchema).describe(
  'IngestionUpdateFinalizeTaskSchema'
);

export type IngestionUpdateFinalizeTask = z.infer<typeof ingestionUpdateFinalizeTaskSchema>;
//#endregion

//#region IngestionSwapUpdate
//mergeTaskCreation
export const ingestionSwapUpdateCreateMergeTasksJobSchema = createJobResponseSchema(ingestionSwapUpdateJobParamsSchema).describe(
  'IngestionSwapUpdateCreateMergeTasksJobSchema'
);
export type IngestionSwapUpdateCreateMergeTasksJob = z.infer<typeof ingestionSwapUpdateCreateMergeTasksJobSchema>;

//finalize
export const ingestionSwapUpdateFinalizeJobSchema = createJobResponseSchema(ingestionSwapUpdateFinalizeJobParamsSchema)
  .and(requiredProductNameAndTypeSchema)
  .describe('IngestionSwapUpdateFinalizeJobSchema');
export type IngestionSwapUpdateFinalizeJob = z.infer<typeof ingestionSwapUpdateFinalizeJobSchema>;
export const ingestionSwapUpdateFinalizeTaskSchema = createTaskResponseSchema(ingestionSwapUpdateTaskParamsSchema).describe(
  'IngestionSwapUpdateFinalizeTaskSchema'
);
export type IngestionSwapUpdateFinalizeTask = z.infer<typeof ingestionSwapUpdateFinalizeTaskSchema>;
//#endregion

//#region Export
export const exportJobSchema = createJobResponseSchema(exportJobParametersSchema.passthrough()).describe('ExportJobSchema');
export type ExportJob = z.infer<typeof exportJobSchema>;

//init
export const exportInitTaskSchema = createTaskResponseSchema(taskBlockDuplicationParamSchema).describe('ExportInitTaskSchema');
export type ExportInitTask = z.infer<typeof exportInitTaskSchema>;

//finalize
export const exportFinalizeTaskSchema = createTaskResponseSchema(exportFinalizeTaskParamsSchema).describe('ExportFinalizeTaskSchema');
export type ExportFinalizeTask = z.infer<typeof exportFinalizeTaskSchema>;
export type ExportFinalizeTaskParams = z.infer<typeof exportFinalizeTaskParamsSchema>;
//#endregion

// Ingestion domain types
type IngestionJobType = 'Ingestion_New' | 'Ingestion_Update' | 'Ingestion_Swap_Update';
type IngestionTaskType = 'create-merge-tasks' | 'finalize';

// Export domain types
type ExportJobType = 'Export';
type ExportTaskType = 'init' | 'finalize';

// Operation validation key allows only valid job-task combinations
export type OperationValidationKey = `${IngestionJobType}_${IngestionTaskType}` | `${ExportJobType}_${ExportTaskType}`;

export interface JobTaskSchema {
  jobSchema: z.ZodTypeAny;
  taskSchema: z.ZodTypeAny;
}

export type JobTaskSchemasMap = { [key in OperationValidationKey]: JobTaskSchema };
export const jobTaskSchemaMap: JobTaskSchemasMap = {
  'Ingestion_New_create-merge-tasks': {
    jobSchema: ingestionNewCreateMergeTasksJobSchema,
    taskSchema: ingestionCreateMergeTasksTaskSchema,
  },
  'Ingestion_Update_create-merge-tasks': {
    jobSchema: ingestionUpdateCreateMergeTasksJobSchema,
    taskSchema: ingestionCreateMergeTasksTaskSchema,
  },
  'Ingestion_Swap_Update_create-merge-tasks': {
    jobSchema: ingestionSwapUpdateCreateMergeTasksJobSchema,
    taskSchema: ingestionCreateMergeTasksTaskSchema,
  },
  Ingestion_New_finalize: {
    jobSchema: ingestionNewFinalizeJobSchema,
    taskSchema: ingestionNewFinalizeTaskSchema,
  },
  Ingestion_Update_finalize: {
    jobSchema: ingestionUpdateFinalizeJobSchema,
    taskSchema: ingestionUpdateFinalizeTaskSchema,
  },

  Ingestion_Swap_Update_finalize: {
    jobSchema: ingestionSwapUpdateFinalizeJobSchema,
    taskSchema: ingestionSwapUpdateFinalizeTaskSchema,
  },
  Export_init: {
    jobSchema: exportJobSchema,
    taskSchema: exportInitTaskSchema,
  },
  Export_finalize: {
    jobSchema: exportJobSchema,
    taskSchema: exportFinalizeTaskSchema,
  },
};
