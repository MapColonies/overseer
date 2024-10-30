import { TileOutputFormat } from '@map-colonies/mc-model-types';
import { z } from 'zod';

export const newAdditionalParamsSchema = z.object({
  jobTrackerServiceUrl: z.string().url(),
});

export const swapUpdateAdditionalParamsSchema = newAdditionalParamsSchema.extend({
  tileOutputFormat: z.nativeEnum(TileOutputFormat),
});

export type SwapUpdateAdditionalParams = z.infer<typeof swapUpdateAdditionalParamsSchema>;

export const updateAdditionalParamsSchema = swapUpdateAdditionalParamsSchema.extend({
  displayPath: z.string().uuid(),
});

export type UpdateAdditionalParams = z.infer<typeof updateAdditionalParamsSchema>;

export const layerNameSchema = z.object({
  resourceId: z.string(),
  productType: z.string(),
});

export type LayerName = z.infer<typeof layerNameSchema>;

export const internalIdSchema = z.object({
  internalId: z.string().uuid(),
});
