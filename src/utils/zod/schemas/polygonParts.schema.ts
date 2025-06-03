import {
  aggregationFeaturePropertiesSchema,
  featureCollectionSchema,
  featureSchema,
  multiPolygonSchema,
  partSchema,
  polygonPartsPayloadSchema,
  polygonSchema,
} from '@map-colonies/raster-shared';
import z from 'zod';

export const requiredAggregationFeatureSchema = featureSchema(polygonSchema.or(multiPolygonSchema), aggregationFeaturePropertiesSchema);

// TODO: move to raster-shared?
export const polygonPartsFindResponseFeaturePropertiesSchema = polygonPartsPayloadSchema
  .pick({ catalogId: true, productId: true, productType: true, productVersion: true })
  .merge(partSchema.innerType().omit({ footprint: true }))
  .merge(
    z.object({
      requestFeatureId: featureSchema(polygonSchema, z.object({})).pick({ id: true }).shape.id,
      partId: z.string().uuid(),
      ingestionDateUTC: z.coerce.date(),
      id: z.string().uuid(),
    })
  );
// TODO: move type to raster-shared?! update ppm-manager & ppm-worker
export type PolygonPartsFindResponseFeatureProperties = z.infer<typeof polygonPartsFindResponseFeaturePropertiesSchema>;

export const polygonPartsFindResponseSchema = featureCollectionSchema(featureSchema(polygonSchema, polygonPartsFindResponseFeaturePropertiesSchema));
