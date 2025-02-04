import {
  layerDataSchema,
  newAdditionalParamsSchema,
  newRasterLayerMetadataSchema,
  polygonPartsEntityNameSchema,
  TileOutputFormat,
  tilesMimeFormatSchema,
  updateAdditionalParamsSchema,
  updateRasterLayerRequestSchema,
} from '@map-colonies/raster-shared';
import { z } from 'zod';
import { Grid } from '../../../common/interfaces';

export const extendedRasterLayerMetadataSchema = newRasterLayerMetadataSchema
  .extend({
    catalogId: z.string().uuid(),
    displayPath: z.string().uuid(),
    layerRelativePath: z.string(),
    tileOutputFormat: z.nativeEnum(TileOutputFormat),
    tileMimeType: tilesMimeFormatSchema,
    grid: z.nativeEnum(Grid),
  })
  .refine(
    (data) => {
      const [catalogId, displayPath] = data.layerRelativePath.split('/');
      return catalogId === data.catalogId && displayPath === data.displayPath;
    },
    { message: 'layerRelativePath must be in the format of {catalogId}/{displayPath}' }
  )
  .describe('extendedRasterLayerMetadataSchema');

export const ingestionNewExtendedJobParamsSchema = layerDataSchema.extend({
  metadata: extendedRasterLayerMetadataSchema,
  additionalParams: newAdditionalParamsSchema.merge(polygonPartsEntityNameSchema),
});

export const internalIdSchema = z.object({
  internalId: z.string().uuid(),
});

//#region AdditionalParams
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

//#endregion
