import path from 'path';
import { Logger } from '@map-colonies/js-logger';
import { ChunkProcessor, ShapefileChunk, ShapefileChunkReader } from '@map-colonies/shapefile-reader';
import { IConfig } from 'config';
import { productFeatureSchema } from '@map-colonies/raster-shared';
import { Feature, MultiPolygon, Polygon } from 'geojson';
import { DependencyContainer } from 'tsyringe';
import { SERVICES } from '../../common/constants';
import { ProductReadError } from '../../common/errors';

export interface ReadProductGeometry {
  (productPath: string): Promise<Polygon | MultiPolygon>;
}

/**
 * Creates a function that reads product geometry from a shapefile.
 *
 * @param container - The dependency injection container used to resolve dependencies
 * @returns A function that takes a product path and returns a Promise resolving to the product's geometry (Polygon or MultiPolygon)
 */
export const productReaderFactory = (container: DependencyContainer): ReadProductGeometry => {
  const config = container.resolve<IConfig>(SERVICES.CONFIG);
  const logger = container.resolve<Logger>(SERVICES.LOGGER);
  const maxVerticesPerChunk = config.get<number>('shapefileReader.maxVerticesPerChunk');
  const ingestionSourcesDirPath = config.get<string>('ingestionSourcesDirPath');
  const shapefileReader = new ShapefileChunkReader({ maxVerticesPerChunk, generateFeatureId: true });

  return async (productPath: string): Promise<Polygon | MultiPolygon> => {
    let geometry: Polygon | MultiPolygon | undefined;

    // Use absolute path from root if ingestionSourcesDirPath is relative
    const basePath = path.join('/', ingestionSourcesDirPath);
    const shapefileFullPath = path.join(basePath, productPath);

    logger.info({ msg: 'reading product geometry from shapefile', shapefileFullPath, productPath, basePath });
    const processor: ChunkProcessor = {
      // eslint-disable-next-line @typescript-eslint/require-await
      process: async (chunk: ShapefileChunk): Promise<void> => {
        const product = validateProduct(chunk, maxVerticesPerChunk);
        geometry = product?.geometry;
      },
    };
    try {
      await shapefileReader.readAndProcess(shapefileFullPath, processor);
      if (geometry === undefined) {
        throw new Error('No Geometry found in shapefile');
      }
      logger.info({ msg: 'successfully read product geometry from shapefile', shapefileFullPath, geometryType: geometry.type });
      return geometry;
    } catch (err) {
      const productReadError = new ProductReadError(err, shapefileFullPath);
      logger.error({ msg: productReadError.message, err });
      throw productReadError;
    }
  };
};

export const validateProduct = (chunk: ShapefileChunk, maxVerticesPerChunk: number): Feature<Polygon | MultiPolygon> | undefined => {
  if (chunk.features.length === 0 && chunk.skippedFeatures.length === 0) {
    return undefined;
  }
  if (chunk.skippedFeatures.length > 1 || chunk.features.length > 1) {
    throw new Error('Product shapefile contains multiple features');
  }
  if (chunk.skippedFeatures.length === 1 && chunk.features.length === 0) {
    throw new Error(`Product exceeded maximum allowed vertices- current:${chunk.skippedVerticesCount} > allowed:${maxVerticesPerChunk}`);
  }

  const product = productFeatureSchema.parse(chunk.features);
  return product;
};
