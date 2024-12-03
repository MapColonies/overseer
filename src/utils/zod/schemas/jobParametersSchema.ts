import { polygonPartsEntityNameSchema, TileOutputFormat } from '@map-colonies/mc-model-types';
import { z } from 'zod';
import { multiPolygonSchema, polygonSchema } from './geoSchema';

export const displayPathSchema = z.string().uuid();

export const newAdditionalParamsSchema = z.object({
  jobTrackerServiceURL: z.string().url(),
});

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
