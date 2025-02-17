import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Tracer } from '@opentelemetry/api';
import { inject, injectable } from 'tsyringe';
import { feature, featureCollection, intersect } from '@turf/turf';
import PolygonBbox from '@turf/bbox';
import { Logger } from '@map-colonies/js-logger';
import { bboxSchema, multiPolygonSchema, polygonSchema, SourceType, type RoiFeature, type RoiFeatureCollection } from '@map-colonies/raster-shared';
import { LayerMetadata } from '@map-colonies/mc-model-types';
import { bboxToTileRange, degreesPerPixelToZoomLevel, degreesPerTile, type ITileRange } from '@map-colonies/mc-utils';
import type { BBox, Feature, MultiPolygon, Polygon } from 'geojson';
import { SERVICES, TilesStorageProvider } from '../../common/constants';
import { IConfig, type TaskSources, type ZoomBoundsParameters } from '../../common/interfaces';
import type { ExportInitJob } from '../../utils/zod/schemas/job.schema';
import { createChildSpan } from '../../common/tracing';

@injectable()
export class ExportTaskManager {
  private readonly allWorldBounds: BBox;
  private readonly tilesProvider: TilesStorageProvider;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.TRACER) private readonly tracer: Tracer
  ) {
    this.tilesProvider = this.config.get<TilesStorageProvider>('tilesStorageProvider');
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    this.allWorldBounds = [-180, -90, 180, 90];
  }

  public generateTileRangeBatches(roi: RoiFeatureCollection, layerMetadata: LayerMetadata): ITileRange[] {
    return context.with(
      trace.setSpan(context.active(), this.tracer.startSpan(`${ExportTaskManager.name}.${this.generateTileRangeBatches.name}`)),
      () => {
        const activeSpan = trace.getActiveSpan();
        const logger = this.logger.child({ layerId: layerMetadata.id });

        try {
          logger.info('generating tile range batches for export task');
          activeSpan?.setAttributes({
            layerId: layerMetadata.id,
            roiFeaturesCount: roi.features.length,
          });

          const layerFootprint = polygonSchema.or(multiPolygonSchema).parse(layerMetadata.footprint);
          logger.debug('layer footprint validated as polygon or multiPolygon');

          const targetFeature = feature(layerFootprint);
          const batches: ITileRange[] = [];

          for (const feature of roi.features) {
            logger.debug({ processedRoi: feature }, 'processing roi feature for tile range generation');
            const { maxZoom, minZoom, bbox } = this.calculateZoomLevelsAndBbox(feature, targetFeature);
            logger.debug({ msg: 'calculated zoom levels and bbox', maxZoom, minZoom, bbox });

            for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
              logger.debug({ msg: 'generating tile range for zoom level', zoom });
              const recordBatches = bboxToTileRange(bbox, zoom);
              logger.debug({ msg: 'generated tile range', tileRange: recordBatches });
              batches.push(recordBatches);
            }
          }

          activeSpan?.setAttributes({ batchesCount: batches.length });
          logger.info({ msg: 'tile range batches generated', batchesCount: batches.length });
          return batches;
        } catch (err) {
          if (err instanceof Error) {
            logger.error({ msg: 'Failed to generate tile range batches', err });
            activeSpan?.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
            activeSpan?.recordException(err);
          }
          throw err;
        } finally {
          activeSpan?.end();
        }
      }
    );
  }

  public generateSources(job: ExportInitJob, layerMetadata: LayerMetadata): TaskSources[] {
    return context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${ExportTaskManager.name}.${this.generateSources.name}`)), () => {
      const activeSpan = trace.getActiveSpan();
      const logger = this.logger.child({ layerId: layerMetadata.id, jobId: job.id });

      try {
        logger.info('generating sources for export task');
        activeSpan?.setAttributes({
          layerId: layerMetadata.id,
          jobId: job.id,
        });

        const roiBbox = PolygonBbox(job.parameters.exportInputParams.roi);
        logger.debug({ msg: 'roi bbox calculated', roiBbox });

        const separator = this.getSeparator();
        logger.debug({ msg: 'separator calculated', separator });

        const sources: TaskSources[] = [
          {
            path: job.parameters.additionalParams.packageRelativePath,
            type: SourceType.GPKG,
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

        activeSpan?.setAttributes({ sources: JSON.stringify(sources) });
        logger.info({ msg: 'sources generated', sources });
        return sources;
      } catch (err) {
        if (err instanceof Error) {
          logger.error({ msg: 'Failed to generate sources', err });
          activeSpan?.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          activeSpan?.recordException(err);
        }
        throw err;
      } finally {
        activeSpan?.end();
      }
    });
  }

  private getSeparator(): string {
    return this.tilesProvider === TilesStorageProvider.S3 ? '/' : '\\';
  }

  private calculateZoomLevelsAndBbox(roiFeature: RoiFeature, targetFeature: Feature<Polygon | MultiPolygon>): ZoomBoundsParameters {
    const span = createChildSpan(`${ExportTaskManager.name}.${this.calculateZoomLevelsAndBbox.name}`, trace.getActiveSpan());

    try {
      const maxZoom = degreesPerPixelToZoomLevel(roiFeature.properties.maxResolutionDeg);
      const minZoom = degreesPerPixelToZoomLevel(roiFeature.properties.minResolutionDeg);
      const bbox = this.sanitizeBbox(roiFeature, targetFeature, maxZoom);

      span.setAttributes({ maxZoom, minZoom });
      return { maxZoom, minZoom, bbox };
    } finally {
      span.end();
    }
  }

  private sanitizeBbox(roiFeature: RoiFeature, targetFeature: Feature<Polygon | MultiPolygon>, zoom: number): BBox {
    this.logger.debug({ msg: 'Starting bbox sanitization for zoom level', zoom });
    this.logger.debug({
      msg: 'Input features coordinates for bbox sanitization',
      roiCoordinates: roiFeature.geometry.coordinates,
      targetCoordinates: targetFeature.geometry.coordinates,
    });
    try {
      const collection = featureCollection([roiFeature, targetFeature]);
      const intersection = intersect(collection);
      if (intersection === null) {
        throw new Error('No intersection found between features');
      }

      this.logger.debug({ msg: 'Intersection found', intersection });

      const bbox = bboxSchema.parse(PolygonBbox(intersection));
      this.logger.debug({ msg: 'bbox calculated and validated', bbox });

      const sanitizedBbox = this.snapBBoxToTileGrid(bbox, zoom);
      this.logger.debug({ msg: 'bbox sanitized and validated', sanitizedBbox });
      return sanitizedBbox;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(JSON.stringify(err));
      error.message = `Error occurred while trying to sanitized bbox: ${error.message}`;
      throw error;
    }
  }

  private snapBBoxToTileGrid(bbox: BBox, zoomLevel: number): BBox {
    this.logger.debug({ msg: `Starting bbox snapping for zoom level ${zoomLevel} ` });
    if (zoomLevel === 0) {
      this.logger.debug({ msg: 'Zoom level is 0, returning world bounds' });
      return this.allWorldBounds;
    }

    const tileDegrees = degreesPerTile(zoomLevel);
    this.logger.debug({ msg: `Tile resolution at zoom ${zoomLevel}: ${tileDegrees}` });

    const snappedBounds = this.snapBounds(bbox, tileDegrees);

    return snappedBounds;
  }

  private snapBounds(bbox: BBox, tileDegrees: number): BBox {
    const coordinates = [
      { coord: bbox[0], isMax: false }, // minLon
      { coord: bbox[1], isMax: false }, // minLat
      { coord: bbox[2], isMax: true }, // maxLon
      { coord: bbox[3], isMax: true }, // maxLat
    ];
    this.logger.debug({ msg: 'Starting bounds snapping', coordinates });

    const snappedBounds = coordinates.map(({ coord, isMax }) => this.snapCoordinateToGrid(coord, tileDegrees, isMax));

    this.logger.debug({
      msg: 'Snapped bounds calculated',
      minLon: { original: bbox[0], snapped: snappedBounds[0] },
      maxLon: { original: bbox[1], snapped: snappedBounds[1] },
      minLat: { original: bbox[2], snapped: snappedBounds[2] },
      maxLat: { original: bbox[3], snapped: snappedBounds[3] },
    });

    return bboxSchema.parse(snappedBounds);
  }

  private snapCoordinateToGrid(cord: number, tileDegrees: number, isMaxBoundary: boolean): number {
    this.logger.debug({ msg: 'Starting coordinate snapping', cord, tileDegrees, isMaxBoundary });
    const snappedCord = Math.floor(cord / tileDegrees) * tileDegrees;

    // Expand bounds if original coordinates weren't exactly on grid lines
    if (isMaxBoundary && snappedCord !== cord) {
      const expandedCord = snappedCord + tileDegrees;
      this.logger.debug({ msg: 'Expanding snapped coordinate', snappedCord, expandedCord });
      return expandedCord;
    }

    this.logger.debug({ msg: 'Coordinate snapped', snappedCord });
    return snappedCord;
  }
}
