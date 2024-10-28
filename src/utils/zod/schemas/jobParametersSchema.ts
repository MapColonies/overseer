import { TileOutputFormat } from '@map-colonies/mc-model-types';
import { z } from 'zod';

export const updateAdditionalParamsSchema = z.object({
  jobTrackerServiceUrl: z.string().url(),
  displayPath: z.string().uuid(),
  tileOutputFormat: z.nativeEnum(TileOutputFormat),
});

export type UpdateAdditionalParams = z.infer<typeof updateAdditionalParamsSchema>;
