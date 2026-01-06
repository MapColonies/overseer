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

export const ingestionNewCreateTasksJobSchema = createJobResponseSchema(ingestionNewJobParamsSchema)
  .and(internalIdSchema)
  .describe('IngestionNewCreateTasksJobSchema');
export type IngestionNewCreateTasksJob = z.infer<typeof ingestionNewCreateTasksJobSchema>;

export const ingestionCreateTasksTaskSchema = createTaskResponseSchema(extendedTaskBlockDuplicationParamSchema).describe(
  'IngestionNewCreateTasksTaskSchema'
);
export type IngestionCreateTasksTask = z.infer<typeof ingestionCreateTasksTaskSchema>;
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
export const ingestionUpdateCreateTasksJobSchema = createJobResponseSchema(ingestionUpdateJobParamsSchema).describe(
  'IngestionUpdateCreateTasksJobSchema'
);
export type IngestionUpdateCreateTasksJob = z.infer<typeof ingestionUpdateCreateTasksJobSchema>;

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
export const ingestionSwapUpdateCreateTasksJobSchema = createJobResponseSchema(ingestionSwapUpdateJobParamsSchema).describe(
  'IngestionSwapUpdateCreateTasksJobSchema'
);
export type IngestionSwapUpdateCreateTasksJob = z.infer<typeof ingestionSwapUpdateCreateTasksJobSchema>;

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
type IngestionTaskType = 'create-tasks' | 'finalize';

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
  'Ingestion_New_create-tasks': {
    jobSchema: ingestionNewCreateTasksJobSchema,
    taskSchema: ingestionCreateTasksTaskSchema,
  },
  'Ingestion_Update_create-tasks': {
    jobSchema: ingestionUpdateCreateTasksJobSchema,
    taskSchema: ingestionCreateTasksTaskSchema,
  },
  'Ingestion_Swap_Update_create-tasks': {
    jobSchema: ingestionSwapUpdateCreateTasksJobSchema,
    taskSchema: ingestionCreateTasksTaskSchema,
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
