/* eslint-disable @typescript-eslint/naming-convention */
import { z } from 'zod';
import {
  createJobResponseSchema,
  createTaskResponseSchema,
  ingestionNewFinalizeTaskParamsSchema,
  ingestionNewJobParamsSchema,
  ingestionSwapUpdateJobParamsSchema,
  ingestionSwapUpdateTaskParamsSchema,
  ingestionUpdateFinalizeTaskParamsSchema,
  ingestionUpdateJobParamsSchema,
  JobTypes,
  taskBlockDuplicationParamSchema,
  TaskTypes,
} from '@map-colonies/raster-shared';
import { ingestionNewExtendedJobParamsSchema } from './jobParametersSchema';
import { ingestionSwapUpdateFinalizeJobParamsSchema, ingestionUpdateFinalizeJobParamsSchema } from './additionalParams';

//#region IngestionNew
//init
export const ingestionNewInitJobSchema = createJobResponseSchema(ingestionNewJobParamsSchema);
export type IngestionNewInitJob = z.infer<typeof ingestionNewInitJobSchema>;

export const ingestionInitTaskSchema = createTaskResponseSchema(taskBlockDuplicationParamSchema);
export type IngestionInitTask = z.infer<typeof ingestionInitTaskSchema>;

//finalize
export const ingestionNewFinalizeJobSchema = createJobResponseSchema(ingestionNewExtendedJobParamsSchema);
export type IngestionNewFinalizeJob = z.infer<typeof ingestionNewFinalizeJobSchema>;
export const ingestionNewFinalizeTaskSchema = createTaskResponseSchema(ingestionNewFinalizeTaskParamsSchema);
export type IngestionNewFinalizeTask = z.infer<typeof ingestionNewFinalizeTaskSchema>;
//#endregion

//#region IngestionUpdate
//init
export const ingestionUpdateInitJobSchema = createJobResponseSchema(ingestionUpdateJobParamsSchema);
export type IngestionUpdateInitJob = z.infer<typeof ingestionUpdateInitJobSchema>;

//finalize
export const ingestionUpdateFinalizeJobSchema = createJobResponseSchema(ingestionUpdateFinalizeJobParamsSchema);
export type IngestionUpdateFinalizeJob = z.infer<typeof ingestionUpdateFinalizeJobSchema>;
export const ingestionUpdateFinalizeTaskSchema = createTaskResponseSchema(ingestionUpdateFinalizeTaskParamsSchema);
export type IngestionUpdateFinalizeTask = z.infer<typeof ingestionUpdateFinalizeTaskSchema>;
//endregion

//#region IngestionSwapUpdate
//init
export const ingestionSwapUpdateInitJobSchema = createJobResponseSchema(ingestionSwapUpdateJobParamsSchema);
export type IngestionSwapUpdateInitJob = z.infer<typeof ingestionSwapUpdateInitJobSchema>;

//finalize
export const ingestionSwapUpdateFinalizeJobSchema = createJobResponseSchema(ingestionSwapUpdateFinalizeJobParamsSchema);
export type IngestionSwapUpdateFinalizeJob = z.infer<typeof ingestionSwapUpdateFinalizeJobSchema>;
export const ingestionSwapUpdateFinalizeTaskSchema = createTaskResponseSchema(ingestionSwapUpdateTaskParamsSchema);
export type IngestionSwapUpdateFinalizeTask = z.infer<typeof ingestionSwapUpdateFinalizeTaskSchema>;
//#endregion

export type OperationValidationKey = `${JobTypes}_${TaskTypes}`;

export const jobTaskSchemaMap = {
  Ingestion_New_init: {
    jobSchema: ingestionNewInitJobSchema,
    taskSchema: ingestionInitTaskSchema,
  },
  Ingestion_New_finalize: {
    jobSchema: ingestionNewFinalizeJobSchema,
    taskSchema: ingestionNewFinalizeTaskSchema,
  },
  Ingestion_Update_init: {
    jobSchema: ingestionUpdateInitJobSchema,
    taskSchema: ingestionInitTaskSchema,
  },
  Ingestion_Update_finalize: {
    jobSchema: ingestionUpdateFinalizeJobSchema,
    taskSchema: ingestionUpdateFinalizeTaskSchema,
  },
  Ingestion_Swap_Update_init: {
    jobSchema: ingestionSwapUpdateInitJobSchema,
    taskSchema: ingestionInitTaskSchema,
  },
  Ingestion_Swap_Update_finalize: {
    jobSchema: ingestionSwapUpdateFinalizeJobSchema,
    taskSchema: ingestionSwapUpdateFinalizeTaskSchema,
  },
};
