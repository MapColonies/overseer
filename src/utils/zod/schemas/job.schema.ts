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
} from '@map-colonies/raster-shared';
import type { JobTypes, TaskTypes } from '@map-colonies/raster-shared';
import { ingestionNewExtendedJobParamsSchema } from './jobParameters.schema';
import { ingestionSwapUpdateFinalizeJobParamsSchema, ingestionUpdateFinalizeJobParamsSchema } from './jobParameters.schema';

//#region Ingestion
//#region IngestionNew
//init
export const ingestionNewInitJobSchema = createJobResponseSchema(ingestionNewJobParamsSchema).describe('IngestionNewInitJobSchema');
export type IngestionNewInitJob = z.infer<typeof ingestionNewInitJobSchema>;

export const ingestionInitTaskSchema = createTaskResponseSchema(taskBlockDuplicationParamSchema).describe('IngestionInitTaskSchema');
export type IngestionInitTask = z.infer<typeof ingestionInitTaskSchema>;

//finalize
export const ingestionNewFinalizeJobSchema = createJobResponseSchema(ingestionNewExtendedJobParamsSchema).describe('IngestionNewFinalizeJobSchema');
export type IngestionNewFinalizeJob = z.infer<typeof ingestionNewFinalizeJobSchema>;
export const ingestionNewFinalizeTaskSchema =
  createTaskResponseSchema(ingestionNewFinalizeTaskParamsSchema).describe('IngestionNewFinalizeTaskSchema');
export type IngestionNewFinalizeTask = z.infer<typeof ingestionNewFinalizeTaskSchema>;
//#endregion

//#region IngestionUpdate
//init
export const ingestionUpdateInitJobSchema = createJobResponseSchema(ingestionUpdateJobParamsSchema).describe('IngestionUpdateInitJobSchema');
export type IngestionUpdateInitJob = z.infer<typeof ingestionUpdateInitJobSchema>;

//finalize
export const ingestionUpdateFinalizeJobSchema = createJobResponseSchema(ingestionUpdateFinalizeJobParamsSchema).describe(
  'IngestionUpdateFinalizeJobSchema'
);
export type IngestionUpdateFinalizeJob = z.infer<typeof ingestionUpdateFinalizeJobSchema>;
export const ingestionUpdateFinalizeTaskSchema = createTaskResponseSchema(ingestionUpdateFinalizeTaskParamsSchema).describe(
  'IngestionUpdateFinalizeTaskSchema'
);
export type IngestionUpdateFinalizeTask = z.infer<typeof ingestionUpdateFinalizeTaskSchema>;
//#endregion

//#region IngestionSwapUpdate
//init
export const ingestionSwapUpdateInitJobSchema =
  createJobResponseSchema(ingestionSwapUpdateJobParamsSchema).describe('IngestionSwapUpdateInitJobSchema');
export type IngestionSwapUpdateInitJob = z.infer<typeof ingestionSwapUpdateInitJobSchema>;

//finalize
export const ingestionSwapUpdateFinalizeJobSchema = createJobResponseSchema(ingestionSwapUpdateFinalizeJobParamsSchema).describe(
  'IngestionSwapUpdateFinalizeJobSchema'
);
export type IngestionSwapUpdateFinalizeJob = z.infer<typeof ingestionSwapUpdateFinalizeJobSchema>;
export const ingestionSwapUpdateFinalizeTaskSchema = createTaskResponseSchema(ingestionSwapUpdateTaskParamsSchema).describe(
  'IngestionSwapUpdateFinalizeTaskSchema'
);
export type IngestionSwapUpdateFinalizeTask = z.infer<typeof ingestionSwapUpdateFinalizeTaskSchema>;
//#endregion
//#endregion

//#region Export
//init
export const exportInitJobSchema = createJobResponseSchema(exportJobParametersSchema);
export type ExportInitJob = z.infer<typeof exportInitJobSchema>;

export const exportInitTaskSchema = createTaskResponseSchema(taskBlockDuplicationParamSchema);
export type ExportInitTask = z.infer<typeof exportInitTaskSchema>;
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
  Export_init: {
    jobSchema: exportInitJobSchema,
    taskSchema: exportInitTaskSchema,
  },
};
