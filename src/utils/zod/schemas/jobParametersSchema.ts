import { TileOutputFormat } from '@map-colonies/mc-model-types';
import { z } from 'zod';
import { polygonSchema } from './geoSchema';

export const newAdditionalParamsSchema = z.object({
  jobTrackerServiceURL: z.string().url(),
});

export const swapUpdateAdditionalParamsSchema = newAdditionalParamsSchema.extend({
  tileOutputFormat: z.nativeEnum(TileOutputFormat),
  footprint: polygonSchema,
});

export const updateAdditionalParamsSchema = swapUpdateAdditionalParamsSchema.extend({
  displayPath: z.string().uuid(),
});

export const layerNameSchema = z.object({
  resourceId: z.string(),
  productType: z.string(),
});

export const internalIdSchema = z.object({
  internalId: z.string().uuid(),
});
