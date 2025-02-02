import { polygonPartsEntityNameSchema, updateAdditionalParamsSchema, updateRasterLayerRequestSchema } from '@map-colonies/raster-shared';

export const updateFinalizeAdditionalParamsSchema = updateAdditionalParamsSchema.merge(polygonPartsEntityNameSchema);

export const swapUpdateFinalizeAdditionalParamsSchema = updateFinalizeAdditionalParamsSchema.extend({
  displayPath: updateAdditionalParamsSchema.shape.displayPath.optional(),
});

export const ingestionUpdateFinalizeJobParamsSchema = updateRasterLayerRequestSchema.extend({
  additionalParams: updateFinalizeAdditionalParamsSchema,
});

export const ingestionSwapUpdateFinalizeJobParamsSchema = updateRasterLayerRequestSchema.extend({
  additionalParams: swapUpdateFinalizeAdditionalParamsSchema,
});
