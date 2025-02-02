import {
  layerDataSchema,
  newAdditionalParamsSchema,
  newRasterLayerMetadataSchema,
  polygonPartsEntityNameSchema,
  TileOutputFormat,
  tilesMimeFormatSchema,
} from '@map-colonies/raster-shared';
import { z } from 'zod';
import { Grid } from '../../../common/interfaces';
import { multiPolygonSchema, polygonSchema } from './geoSchema';

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

export const displayPathSchema = z.string().uuid();

export const swapUpdateAdditionalParamsSchema = newAdditionalParamsSchema.extend({
  tileOutputFormat: z.nativeEnum(TileOutputFormat),
  footprint: polygonSchema.or(multiPolygonSchema),
});

export const updateAdditionalParamsSchema = swapUpdateAdditionalParamsSchema.extend({
  displayPath: displayPathSchema,
});

export const catalogSwapUpdateAdditionalParamsSchema = z
  .object({
    displayPath: displayPathSchema,
  })
  .merge(polygonPartsEntityNameSchema);

export const layerNameSchema = z.object({
  resourceId: z.string(),
  productType: z.string(),
});

export const internalIdSchema = z.object({
  internalId: z.string().uuid(),
});
