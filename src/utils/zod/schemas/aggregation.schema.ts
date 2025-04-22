import { aggregationFeaturePropertiesSchema, featureSchema, multiPolygonSchema, polygonSchema } from '@map-colonies/raster-shared';

export const requiredAggregationFeatureSchema = featureSchema(polygonSchema.or(multiPolygonSchema), aggregationFeaturePropertiesSchema);
