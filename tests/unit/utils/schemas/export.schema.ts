import { ITileRange } from '@map-colonies/mc-utils';
import { z, ZodType } from 'zod';

const extentSchema = z.object({
  minX: z.number(),
  minY: z.number(),
  maxX: z.number(),
  maxY: z.number(),
});

const tileRangeSchema: ZodType<ITileRange> = extentSchema.extend({ zoom: z.number() });

const tileRangeArraySchema: ZodType<ITileRange[]> = z.array(tileRangeSchema);

export { extentSchema, tileRangeArraySchema };
