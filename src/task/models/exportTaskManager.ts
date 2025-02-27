import { sep } from 'path';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Tracer } from '@opentelemetry/api';
import { inject, injectable } from 'tsyringe';
import { feature, featureCollection, intersect } from '@turf/turf';
import PolygonBbox from '@turf/bbox';
import { Logger } from '@map-colonies/js-logger';
import {
  bboxSchema,
  multiPolygonSchema,
  polygonSchema,
  RasterLayerMetadata,
  SourceType,
  type RoiFeature,
  type RoiFeatureCollection,
} from '@map-colonies/raster-shared';
import { bboxToTileRange, degreesPerPixelToZoomLevel, type ITileRange } from '@map-colonies/mc-utils';
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

  public generateTileRangeBatches(roi: RoiFeatureCollection, layerMetadata: RasterLayerMetadata): ITileRange[] {
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

  public generateSources(job: ExportInitJob, layerMetadata: RasterLayerMetadata): TaskSources[] {
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
    return this.tilesProvider === TilesStorageProvider.S3 ? '/' : sep;
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

      return bbox;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(JSON.stringify(err));
      error.message = `Error occurred while trying to sanitized bbox: ${error.message}`;
      throw error;
    }
  }
}
