import {
  newAdditionalParamsSchema,
  newRasterLayerMetadataSchema,
  TileOutputFormat,
  tilesMimeFormatSchema,
  updateAdditionalParamsSchema,
  taskBlockDuplicationParamSchema,
  ingestionBaseJobParamsSchema,
  ingestionUpdateJobParamsSchema,
  multiPolygonSchema,
  polygonSchema,
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

export const ingestionNewExtendedJobParamsSchema = ingestionBaseJobParamsSchema.extend({
  metadata: extendedRasterLayerMetadataSchema,
  additionalParams: newAdditionalParamsSchema,
});

export const internalIdSchema = z.object({
  internalId: z.string().uuid(),
});

//#region AdditionalParams
/** the layer's catalog footprint as it stood before the update, recorded by the update job's init step */
export const previousFootprintSchema = polygonSchema.or(multiPolygonSchema);
export type PreviousFootprint = z.infer<typeof previousFootprintSchema>;

export const updateFinalizeAdditionalParamsSchema = updateAdditionalParamsSchema.extend({
  // optional so jobs created before overseer recorded it still finalize; cache deletion then covers the whole update area
  previousFootprint: previousFootprintSchema.optional(),
});

export const swapUpdateFinalizeAdditionalParamsSchema = updateFinalizeAdditionalParamsSchema.extend({
  displayPath: updateAdditionalParamsSchema.shape.displayPath.optional(),
});

export const ingestionUpdateFinalizeJobParamsSchema = ingestionUpdateJobParamsSchema.extend({
  additionalParams: updateFinalizeAdditionalParamsSchema,
});

export const ingestionSwapUpdateFinalizeJobParamsSchema = ingestionUpdateJobParamsSchema.extend({
  additionalParams: swapUpdateFinalizeAdditionalParamsSchema,
});

//#endregion

//#region Task Parameters with Indexing
export const initTaskIndexingSchema = z.object({
  lastInsertedTaskIndex: z.number().min(0),
  zoomLevel: z.number().min(0),
});

export const extendedTaskBlockDuplicationParamSchema = taskBlockDuplicationParamSchema.extend({
  latestTaskState: initTaskIndexingSchema.optional(),
});
//#endregion
