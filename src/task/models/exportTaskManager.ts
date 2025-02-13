import { sep } from 'node:path';
import { inject, injectable } from 'tsyringe';
import { feature, featureCollection, intersect } from '@turf/turf';
import PolygonBbox from '@turf/bbox';
import type { Logger } from '@map-colonies/js-logger';
import { multiPolygonSchema, polygonSchema, RoiFeature, RoiFeatureCollection } from '@map-colonies/raster-shared';
import { LayerMetadata } from '@map-colonies/mc-model-types';
import { bboxToTileRange, degreesPerPixelToZoomLevel, degreesPerTile, ITileRange } from '@map-colonies/mc-utils';
import { BBox, Feature, MultiPolygon, Polygon } from 'geojson';
import { SERVICES, TilesStorageProvider } from '../../common/constants';
import { BoundingBox, IConfig, TaskSources, ZoomBoundsParameters } from '../../common/interfaces';
import { ExportInitJob } from '../../utils/zod/schemas/job.schema';

@injectable()
export class ExportTaskManager {
  /* eslint-disable @typescript-eslint/no-magic-numbers */
  private readonly allWorldBounds: BBox = [-180, -90, 180, 90];
  /* eslint-enable @typescript-eslint/no-magic-numbers */
  private readonly tilesProvider: TilesStorageProvider;
  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger, @inject(SERVICES.CONFIG) private readonly config: IConfig) {
    this.tilesProvider = this.config.get<TilesStorageProvider>('tilesStorageProvider');
  }

  public generateTileRangeBatches(roi: RoiFeatureCollection, layerMetadata: LayerMetadata): ITileRange[] {
    const layerFootprint = polygonSchema.or(multiPolygonSchema).parse(layerMetadata.footprint);

    const targetFeature = feature(layerFootprint);

    const batches: ITileRange[] = [];

    for (const feature of roi.features) {
      const { maxZoom, minZoom, bbox } = this.calculateZoomLevelsAndBbox(feature, targetFeature);

      for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
        const recordBatches = bboxToTileRange(bbox, zoom);
        batches.push(recordBatches);
      }
    }
    return batches;
  }

  public generateSources(job: ExportInitJob, layerMetadata: LayerMetadata): TaskSources[] {
    const roiBbox = PolygonBbox(job.parameters.exportInputParams.roi);
    const separator = this.getSeparator();

    const sources: TaskSources[] = [
      {
        path: job.parameters.additionalParams.packageRelativePath,
        type: 'GPKG',
        extent: {
          minX: roiBbox[0],
          minY: roiBbox[1],
          maxX: roiBbox[2],
          maxY: roiBbox[3],
        },
      },
      {
        path: `${layerMetadata.id}${separator}${layerMetadata.displayPath}`, //tiles path
        type: this.tilesProvider,
      },
    ];

    return sources;
  }

  private getSeparator() {
    return this.tilesProvider === TilesStorageProvider.S3 ? '/' : sep;
  }

  private calculateZoomLevelsAndBbox(roiFeature: RoiFeature, targetFeature: Feature<Polygon | MultiPolygon>): ZoomBoundsParameters {
    const maxZoom = degreesPerPixelToZoomLevel(roiFeature.properties.maxResolutionDeg);
    const minZoom = degreesPerPixelToZoomLevel(roiFeature.properties.minResolutionDeg);
    const bbox = this.sanitizeBbox(roiFeature, targetFeature, maxZoom);

    return {
      maxZoom,
      minZoom,
      bbox,
    };
  }

  private sanitizeBbox(roiFeature: RoiFeature, targetFeature: Feature<Polygon | MultiPolygon>, zoom: number): BBox | null {
    try {
      const collection = featureCollection([roiFeature, targetFeature]);
      const intersection = intersect(collection);
      if (intersection === null) {
        return null;
      }

      const bbox = PolygonBbox(intersection);
      const sanitized = this.snapBBoxToTileGrid(bbox, zoom);
      return sanitized;
    } catch (error) {
      throw new Error(`Error occurred while trying to sanitized bbox: ${JSON.stringify(error)}`);
    }
  }

  private snapBBoxToTileGrid(bbox: BBox, zoomLevel: number): BBox {
    if (zoomLevel === 0) {
      return this.allWorldBounds;
    }

    const { minLon, minLat, maxLon, maxLat } = this.getBounds(bbox);
    const tileDegrees = degreesPerTile(zoomLevel);
    const snappedMinLon = this.snapCoordinateToGrid(minLon, tileDegrees);
    let snappedMaxLon = this.snapCoordinateToGrid(maxLon, tileDegrees);
    const snappedMinLat = this.snapCoordinateToGrid(minLat, tileDegrees);
    let snappedMaxLat = this.snapCoordinateToGrid(maxLat, tileDegrees);

    // Expand bounds if original coordinates weren't exactly on grid lines
    if (snappedMaxLon !== maxLon) {
      snappedMaxLon += tileDegrees;
    }
    if (snappedMaxLat !== maxLat) {
      snappedMaxLat += tileDegrees;
    }

    return [snappedMinLon, snappedMinLat, snappedMaxLon, snappedMaxLat];
  }

  private getBounds([lon1, lat1, lon2, lat2]: BBox): BoundingBox {
    return { minLon: Math.min(lon1, lon2), minLat: Math.min(lat1, lat2), maxLon: Math.max(lon1, lon2), maxLat: Math.max(lat1, lat2) };
  }

  private snapCoordinateToGrid(cord: number, tileRes: number): number {
    const newCord = Math.floor(cord / tileRes) * tileRes;
    return newCord;
  }
}
