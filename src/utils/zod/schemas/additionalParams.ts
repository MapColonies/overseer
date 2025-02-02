import { polygonPartsEntityNameSchema, updateAdditionalParamsSchema, updateRasterLayerRequestSchema } from '@map-colonies/raster-shared';

export const updateFinalizeAdditionalParamsSchema = updateAdditionalParamsSchema.merge(polygonPartsEntityNameSchema);

export const ingestionUpdateFinalizeJobParamsSchema = updateRasterLayerRequestSchema.extend({
  additionalParams: updateFinalizeAdditionalParamsSchema,
});

export const ingestionSwapUpdateFinalizeJobParamsSchema = ingestionUpdateFinalizeJobParamsSchema;
// ingestionUpdateFinalizeJobParamsSchema
