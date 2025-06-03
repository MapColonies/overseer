import { randomUUID } from 'crypto';
import { join } from 'path';
import type { Logger } from '@map-colonies/js-logger';
import type { ICreateTaskBody } from '@map-colonies/mc-priority-queue';
import { TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { degreesPerPixelToZoomLevel, degreesPerTile, tileBatchGenerator, TileRanger, type ITileRange } from '@map-colonies/mc-utils';
import { CORE_VALIDATIONS, type InputFiles, type PolygonPart } from '@map-colonies/raster-shared';
import type { Span, Tracer } from '@opentelemetry/api';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Units } from '@turf/turf';
import { bbox, booleanWithin, buffer, dissolve, featureCollection, flatten, lineSplit, polygon, polygonToLine, truncate, union } from '@turf/turf';
import type { IConfig } from 'config';
import type { Feature, FeatureCollection, GeoJsonProperties, LineString, MultiPolygon, Polygon } from 'geojson';
import { getTileRangeBresenham } from 'poc-line-rasterize';
import { inject, injectable } from 'tsyringe';
import { SERVICES, type StorageProvider } from '../../common/constants';
import type {
  FeatureCollectionWitZoomDefinitions,
  MergeLowResolutionParameters,
  MergeLowResolutionTilesTaskParams,
  MergeParameters,
  MergeTaskParameters,
  MergeTilesMetadata,
  MergeTilesTaskParams,
  PolygonPartsFindFeatureCollectionFilter,
  PPFeatureCollection,
  TaskSources,
  TilesSource,
  UnifiedPart,
} from '../../common/interfaces';
import { Grid } from '../../common/interfaces';
import { createChildSpan } from '../../common/tracing';
import { PolygonPartsMangerClient } from '../../httpClients/polygonPartsMangerClient';
import { fileExtensionExtractor } from '../../utils/fileUtil';
import { TaskMetrics } from '../../utils/metrics/taskMetrics';
import type { PolygonPartsFindResponseFeatureProperties } from '../../utils/zod/schemas/polygonParts.schema';

// TODO: use flat-earth type or local ITileRange
export interface TileMatrixLimits {
  tileMatrixId: string; // NOTE: OGC defines this property as `tileMatrix`. it is renamed to `tileMatrixId` to avoid collision with tileMatrix type
  minTileRow: number;
  maxTileRow: number;
  minTileCol: number;
  maxTileCol: number;
}

@injectable()
export class TileMergeTaskManager {
  private readonly tilesStorageProvider: string;
  private readonly tileBatchSize: number;
  private readonly taskBatchSize: number;
  private readonly taskType: string;
  private readonly radiusBuffer: number;
  private readonly radiusBufferUnits: Units;
  private readonly truncatePrecision: number;
  private readonly truncateCoordinates: number;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.TRACER) private readonly tracer: Tracer,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.TILE_RANGER) private readonly tileRanger: TileRanger,
    @inject(SERVICES.QUEUE_CLIENT) private readonly queueClient: QueueClient,
    @inject(PolygonPartsMangerClient) private readonly polygonPartsMangerClient: PolygonPartsMangerClient,
    private readonly taskMetrics: TaskMetrics
  ) {
    this.tilesStorageProvider = this.config.get<StorageProvider>('tilesStorageProvider');
    this.tileBatchSize = this.config.get<number>('jobManagement.ingestion.tasks.tilesMerging.tileBatchSize');
    this.taskBatchSize = this.config.get<number>('jobManagement.ingestion.tasks.tilesMerging.taskBatchSize');
    this.taskType = this.config.get<string>('jobManagement.ingestion.tasks.tilesMerging.type');
    this.radiusBuffer = this.config.get<number>('jobManagement.ingestion.tasks.tilesMerging.radiusBuffer');
    this.radiusBufferUnits = this.config.get<Units>('jobManagement.ingestion.tasks.tilesMerging.radiusBufferUnits');
    this.truncatePrecision = this.config.get<number>('jobManagement.ingestion.tasks.tilesMerging.truncatePrecision');
    this.truncateCoordinates = this.config.get<number>('jobManagement.ingestion.tasks.tilesMerging.truncateCoordinates');
  }

  public buildTasks(taskBuildParams: MergeTilesTaskParams): AsyncGenerator<MergeTaskParameters, void, void> {
    return context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${TileMergeTaskManager.name}.${this.buildTasks.name}`)), () => {
      const activeSpan = trace.getActiveSpan();
      activeSpan?.setAttributes({
        taskType: this.taskType,
        partsLength: taskBuildParams.partsData.length,
        ...taskBuildParams.taskMetadata,
        ...taskBuildParams.inputFiles,
      });

      const logger = this.logger.child({ taskType: this.taskType });

      logger.debug({ msg: `Building tasks for ${this.taskType} task` });

      try {
        const mergeParams = this.prepareMergeParameters(taskBuildParams);
        activeSpan?.addEvent('Merge parameters prepared', {
          ...mergeParams.zoomDefinitions,
          ...mergeParams.tilesSource,
        });

        const tasks = this.createZoomLevelTasks(mergeParams, activeSpan);

        logger.debug({ msg: `Successfully built tasks for ${this.taskType} task` });
        return tasks;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const errorMsg = error.message;
        logger.error({ msg: `Failed to build tasks for ${this.taskType} task: ${errorMsg}`, error });
        activeSpan?.setStatus({ code: SpanStatusCode.ERROR, message: errorMsg });
        activeSpan?.recordException(error);
        throw error;
      } finally {
        activeSpan?.end();
      }
    });
  }

  public buildLowResolutionTasks(taskBuildParams: MergeLowResolutionTilesTaskParams): AsyncGenerator<MergeTaskParameters, void, void> {
    const tasks = context.with(
      trace.setSpan(context.active(), this.tracer.startSpan(`${TileMergeTaskManager.name}.${this.buildLowResolutionTasks.name}`)),
      this.innerBuildLowResolutionTasks.bind(this, taskBuildParams)
    );
    return tasks;
  }

  public async pushTasks(jobId: string, jobType: string, tasks: AsyncGenerator<MergeTaskParameters, void, void>): Promise<void> {
    await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${TileMergeTaskManager.name}.${this.pushTasks.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();

      activeSpan?.setAttributes({ taskBatchSize: this.taskBatchSize });
      this.taskMetrics.resetTrackTasksEnqueue(jobType, this.taskType);

      const logger = this.logger.child({ jobId, jobType, taskType: this.taskType });
      let taskBatch: ICreateTaskBody<MergeTaskParameters>[] = [];

      try {
        for await (const task of tasks) {
          const taskBody: ICreateTaskBody<MergeTaskParameters> = { description: 'merge tiles task', parameters: task, type: this.taskType };
          taskBatch.push(taskBody);
          this.taskMetrics.trackTasksEnqueue(jobType, this.taskType, task.batches.length);

          if (taskBatch.length === this.taskBatchSize) {
            logger.info({ msg: 'Pushing task batch to queue', batchLength: taskBatch.length });
            activeSpan?.addEvent('enqueueTasks', { currentTaskBatchSize: taskBatch.length });
            await this.enqueueTasks(jobId, taskBatch);
            taskBatch = [];
          }
        }

        if (taskBatch.length > 0) {
          logger.info({ msg: 'Pushing leftovers task batch to queue', batchLength: taskBatch.length });
          activeSpan?.addEvent('enqueueTasks.leftovers', { currentTaskBatchSize: taskBatch.length });
          await this.enqueueTasks(jobId, taskBatch);
        }
        logger.info({ msg: `Successfully pushed all tasks to queue` });
      } catch (error) {
        if (error instanceof Error) {
          activeSpan?.recordException(error);
          activeSpan?.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        }
        logger.error({ msg: 'Failed to push tasks to queue', error });
        throw error;
      } finally {
        activeSpan?.end();
      }
    });
  }

  // TODO: rename!!!
  private async *innerBuildLowResolutionTasks(taskBuildParams: MergeLowResolutionTilesTaskParams): AsyncGenerator<MergeTaskParameters, void, void> {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.setAttributes({
      taskType: this.taskType,
      partsLength: taskBuildParams.partsData.length,
      ...taskBuildParams.taskMetadata,
      ...taskBuildParams.inputFiles,
    });

    const logger = this.logger.child({ taskType: this.taskType });

    logger.debug({ msg: `Building low resolution tasks for ${this.taskType} task` });

    try {
      // TODO: how to handle adjacent polygon parts sharing a border ?!?!?! - unify all polygon parts in prepareLowResolutionMergeParameters
      const mergeParams = this.prepareLowResolutionMergeParameters(taskBuildParams);
      activeSpan?.addEvent('Merge parameters prepared', {
        ...mergeParams.tilesSource,
      });

      // min zoom level to start looping on zoom levels to perform partial updates
      const minZoom = 1 + degreesPerPixelToZoomLevel(mergeParams.polygonPartsFindFeatureCollectionFilter.features[0].properties.maxResolutionDeg);

      // send find query to http client with zoom filter params based on mergeParams.zoomDefinitions.maxZoom!?
      const clippedExistingPolygonPartsFeatureCollection = await this.polygonPartsMangerClient.find(
        taskBuildParams.polygonPartsEntityName,
        mergeParams.polygonPartsFindFeatureCollectionFilter
      ); // TODO: perhaps we should not clip polygon parts?!

      for (const clippedExistingPolygonPartsFeature of clippedExistingPolygonPartsFeatureCollection.features) {
        const polygonPartsFeature = mergeParams.polygonPartsFindFeatureCollectionFilter.features.find(
          (feature) => feature.id === clippedExistingPolygonPartsFeature.id && feature.id !== undefined
        );
        if (!polygonPartsFeature) {
          throw new Error(); // TODO: handle error
        }
        // convert previous result polygons into lineStrings of the perimeter
        const featureCollectionPerimeter = flatten(
          polygonToLine(polygonPartsFeature, { properties: clippedExistingPolygonPartsFeature.properties })
        ) as FeatureCollection<LineString, PolygonPartsFindResponseFeatureProperties>;

        // split perimeter lineStrings
        const featurePerimeterSections = featureCollectionPerimeter.features.flatMap((feature) => {
          const lineSections = lineSplit(feature, clippedExistingPolygonPartsFeature) as FeatureCollection<
            LineString,
            PolygonPartsFindResponseFeatureProperties
          >;
          return lineSections.features;
        });

        // keep lines intersecting the existing filtered polygon parts
        const featurePerimeterFilteredSections = featurePerimeterSections.filter((featurePerimeterSection) =>
          booleanWithin(featurePerimeterSection, clippedExistingPolygonPartsFeature)
        );

        for (const featurePerimeterFilteredSection of featurePerimeterFilteredSections) {
          const maxZoom = degreesPerPixelToZoomLevel(featurePerimeterFilteredSection.properties.resolutionDegree);
          for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
            // TODO: consider moving zoom level as the top loop
            logger.info({ msg: 'Processing zoom level', zoom });
            const stepSize = degreesPerTile(zoom);
            const segmentGenerator = this.segmentEachGenerator(featurePerimeterFilteredSection);
            for (const segment of segmentGenerator) {
              const tileMatrixLimitsGenerator = this.tileMatrixLimitsGenerator(segment, { ...mergeParams, zoom }, stepSize);
              for (const tileMatrixLimits of tileMatrixLimitsGenerator) {
                yield tileMatrixLimits;
              }
            }
          }
        }
      }

      // TODO: build tasks - for line segments
      // const tasks = this.createZoomLevelTasks(mergeParams, activeSpan);
      // const tasks = this.createLowResolutionTasks();
      // const tasks: MergeTaskParameters[] = []; // TODO: RETURN THE RIGHT THING

      logger.debug({ msg: `Successfully built tasks for ${this.taskType} task` });
      // return tasks;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const errorMsg = error.message;
      logger.error({ msg: `Failed to build tasks for ${this.taskType} task: ${errorMsg}`, error });
      activeSpan?.setStatus({ code: SpanStatusCode.ERROR, message: errorMsg });
      activeSpan?.recordException(error);
      throw error;
    } finally {
      activeSpan?.end();
    }
  }

  private async enqueueTasks(jobId: string, tasks: ICreateTaskBody<MergeTaskParameters>[]): Promise<void> {
    const logger = this.logger.child({ jobId });
    logger.debug({ msg: `Attempting to enqueue task batch` });

    try {
      await this.queueClient.jobManagerClient.createTaskForJob(jobId, tasks);
      logger.info({ msg: `Successfully enqueued task batch`, batchLength: tasks.length });
    } catch (error) {
      const errorMsg = (error as Error).message;
      const message = `Failed to enqueue tasks: ${errorMsg}`;
      logger.error({ msg: message, error });
      throw error;
    }
  }

  private prepareMergeParameters(taskBuildParams: MergeTilesTaskParams): MergeParameters {
    const logger = this.logger.child({ taskType: this.taskType });
    const { taskMetadata, inputFiles, partsData } = taskBuildParams;

    logger.info({ msg: 'creating task parameters' });

    const { ppCollection, zoomDefinitions } = this.createFeatureCollectionWithZoomDefinitions(partsData);
    const tilesSource = this.extractTilesSource(inputFiles);

    return {
      ppCollection,
      zoomDefinitions,
      taskMetadata,
      tilesSource,
    };
  }

  private prepareLowResolutionMergeParameters(taskBuildParams: MergeLowResolutionTilesTaskParams): Omit<MergeLowResolutionParameters, 'zoom'> {
    const logger = this.logger.child({ taskType: this.taskType });
    const { taskMetadata, inputFiles, partsData } = taskBuildParams;

    logger.info({ msg: 'creating low reolution task parameters' });

    const { polygonPartsFindFeatureCollectionFilter: ppFeatureCollection } = this.createPolygonPartsFindFeatureCollectionFilter(partsData);
    const tilesSource = this.extractTilesSource(inputFiles);

    return {
      polygonPartsFindFeatureCollectionFilter: ppFeatureCollection,
      taskMetadata,
      tilesSource,
    };
  }

  private extractTilesSource(inputFiles: InputFiles): TilesSource {
    const { originDirectory, fileNames } = inputFiles;
    if (fileNames.length > 1) {
      throw new Error('Multiple files ingestion is currently not supported');
    }
    const fileName = fileNames[0];
    const tilesPath = join(originDirectory, fileName);

    return {
      fileName,
      tilesPath,
    };
  }

  private createFeatureCollectionWithZoomDefinitions(parts: PolygonPart[]): FeatureCollectionWitZoomDefinitions {
    this.logger.info({
      msg: 'Generating featureParts',
      numberOfParts: parts.length,
    });

    let partsMaxZoom = 0;

    const featureParts = parts.map((part) => {
      const featurePart = this.createFeaturePolygon(part, { maxZoom: degreesPerPixelToZoomLevel(part.resolutionDegree) });

      const currentZoom = featurePart.properties.maxZoom;

      partsMaxZoom = Math.max(partsMaxZoom, currentZoom);
      return featurePart;
    });

    const partsZoomLevelMatch = featureParts.every((part) => part.properties.maxZoom === partsMaxZoom);

    const zoomDefinitions = {
      maxZoom: partsMaxZoom,
      partsZoomLevelMatch,
    };

    this.logger.info({
      msg: 'Calculated parts zoom definitions',
      partsMaxZoom,
      partsZoomLevelMatch,
    });

    return {
      ppCollection: featureCollection(featureParts),
      zoomDefinitions,
    };
  }

  // TODO: consider refactoring the low resolution to a separate module and perhaps utilizing interfaces
  private createPolygonPartsFindFeatureCollectionFilter(parts: PolygonPart[]): PolygonPartsFindFeatureCollectionFilter {
    this.logger.info({
      msg: 'Generating featureParts',
      numberOfParts: parts.length,
    });

    const featureParts = parts.map((part) => this.createFeaturePolygon(part, { minResolutionDeg: part.resolutionDegree }, randomUUID()));

    const dissolvedFeatureCollection = dissolve(featureCollection(featureParts), { propertyName: 'minResolutionDeg' }) as FeatureCollection<
      Polygon,
      { minResolutionDeg: number }
    >;
    const polygonPartsFindFeatureCollectionFilter = {
      ...dissolvedFeatureCollection,
      features: dissolvedFeatureCollection.features.map((feature) => {
        return { ...feature, properties: { ...feature.properties, maxResolutionDeg: CORE_VALIDATIONS.resolutionDeg.min } };
      }),
    };
    return {
      polygonPartsFindFeatureCollectionFilter,
    };
  }

  private createFeaturePolygon<T extends GeoJsonProperties>(part: PolygonPart, properties?: T, id?: string | number): Feature<Polygon, T> {
    const logger = this.logger.child({
      partName: part.sourceName,
    });

    logger.debug({ msg: `Feature part properties: ${JSON.stringify(properties)}` });
    const featurePolygon = polygon(part.footprint.coordinates, properties, { id });

    return featurePolygon;
  }

  private async *createZoomLevelTasks(params: MergeParameters, parentSpan: Span | undefined): AsyncGenerator<MergeTaskParameters, void, void> {
    const span = createChildSpan(`${TileMergeTaskManager.name}.${this.createZoomLevelTasks.name}`, parentSpan);

    const { ppCollection, taskMetadata, zoomDefinitions, tilesSource } = params;
    const { maxZoom, partsZoomLevelMatch } = zoomDefinitions;
    const logger = this.logger.child({ taskType: this.taskType, maxZoom, partsZoomLevelMatch });

    const unifiedPart = this.unifyParts(ppCollection, tilesSource);
    logger.info({ msg: 'Creating tasks for zoom levels' });

    const getUnifiedPart = partsZoomLevelMatch
      ? (): UnifiedPart => {
          return unifiedPart;
        }
      : (zoom: number): UnifiedPart => {
          const filteredFeatures = ppCollection.features.filter((feature) => feature.properties.maxZoom >= zoom);
          const collection = featureCollection(filteredFeatures);
          return this.unifyParts(collection, tilesSource);
        };

    span.setAttributes({ partsZoomLevelMatch, maxZoom, ppCollectionLength: ppCollection.features.length });

    for (let zoom = maxZoom; zoom >= 0; zoom--) {
      logger.info({ msg: 'Processing zoom level', zoom });
      const unifiedPart = getUnifiedPart(zoom);
      yield* this.createTasksForPart(unifiedPart, zoom, taskMetadata, span);
    }
    span.end();
  }

  private *createLowResolutionTasks(
    tileRange: ITileRange,
    params: MergeLowResolutionParameters,
    parentSpan: Span | undefined
  ): Generator<MergeTaskParameters, void, void> {
    const span = createChildSpan(`${TileMergeTaskManager.name}.${this.createLowResolutionTasks.name}`, parentSpan);

    const {
      taskMetadata: { grid, isNewTarget, layerRelativePath, tileOutputFormat: targetFormat },
      tilesSource,
      polygonPartsFindFeatureCollectionFilter,
    } = params;
    const logger = this.logger.child({ taskType: this.taskType });

    logger.info({ msg: `Creating tasks for zoom level ${params.zoom}` });

    // TODO: fix the attributes
    // span.setAttributes({ partsZoomLevelMatch, ppCollectionLength: ppCollection.features.length });

    const [minX, minY, maxX, maxY] = bbox(polygonPartsFindFeatureCollectionFilter);
    yield {
      batches: [tileRange],
      isNewTarget,
      sources: [
        { type: this.tilesStorageProvider, path: layerRelativePath },
        {
          type: fileExtensionExtractor(tilesSource.fileName),
          path: tilesSource.tilesPath,
          extent: { minX, minY, maxX, maxY },
          grid,
        },
      ],
      targetFormat,
    };
    // yield* this.createTasksForPart(unifiedPart, zoom, taskMetadata, span);
    span.end();
  }

  private unifyParts(featureCollection: PPFeatureCollection, tilesSource: TilesSource): UnifiedPart {
    const { fileName, tilesPath } = tilesSource;
    const isOnePart = featureCollection.features.length === 1;

    if (isOnePart) {
      const featurePart = featureCollection.features[0];
      return {
        // TODO: refactor
        fileName: fileName,
        tilesPath: tilesPath,
        footprint: featurePart,
        extent: bbox(featurePart),
      };
    }

    // truncate is recommended by turf: https://github.com/Turfjs/turf/issues/1983 due an open accuracy bug
    const truncatedFeatureCollection = truncate(featureCollection, { precision: this.truncatePrecision, coordinates: this.truncateCoordinates });
    const mergedFootprint = union(truncatedFeatureCollection);
    if (mergedFootprint === null) {
      throw new Error('Failed to merge parts because the union result is null');
    }
    const bufferedFeature = this.createBufferedFeature(mergedFootprint);
    // TODO: it's better to change the order between buffer and union - prevents overlapping parts

    return {
      fileName,
      tilesPath,
      footprint: bufferedFeature,
      extent: bbox(bufferedFeature),
    };
  }

  // strip out all gaps and holes in the polygon which simplifies the polygon(solved the issue with tileRanger intersect error)
  private createBufferedFeature(feature: Feature<Polygon | MultiPolygon>): Feature<Polygon | MultiPolygon> {
    const logger = this.logger.child({ featureType: feature.type, radiusBuffer: this.radiusBuffer });

    const bufferOutFeature = buffer(feature.geometry, this.radiusBuffer, { units: this.radiusBufferUnits });

    if (bufferOutFeature === undefined) {
      logger.warn({ msg: 'Failed to buffer Out feature because the buffer result is undefined, returning original feature' });
      return feature;
    }

    const bufferInFeature = buffer(bufferOutFeature.geometry, -this.radiusBuffer, { units: this.radiusBufferUnits });

    if (bufferInFeature === undefined) {
      logger.warn({ msg: 'Failed to buffer In feature because the buffer result is undefined, returning original feature' });
      return feature;
    }

    logger.debug({ msg: 'Successfully created buffered feature' });
    return bufferInFeature;
  }

  private async *createTasksForPart(
    part: UnifiedPart,
    zoom: number,
    tilesMetadata: MergeTilesMetadata,
    parentSpan?: Span | undefined
  ): AsyncGenerator<MergeTaskParameters, void, void> {
    const span = createChildSpan(`${TileMergeTaskManager.name}.${this.createTasksForPart.name}.zoom.${zoom}`, parentSpan);
    span.setAttributes({ part: JSON.stringify(part), zoom, maxTileBatchSize: this.tileBatchSize });
    const { layerRelativePath, grid, isNewTarget, tileOutputFormat } = tilesMetadata;
    const logger = this.logger.child({ zoomLevel: zoom, isNewTarget, layerRelativePath, tileOutputFormat, grid });

    const footprint = part.footprint;
    const rangeGenerator = this.tileRanger.encodeFootprint(footprint, zoom);
    const batches = tileBatchGenerator(this.tileBatchSize, rangeGenerator);
    const sources = this.createPartSources(part, grid, layerRelativePath);

    for await (const batch of batches) {
      logger.debug({ msg: 'Yielding batch task', batchSize: batch.length });
      span.addEvent('Yielding batch task', { batchSize: batch.length, batch: JSON.stringify(batch) });
      yield {
        targetFormat: tileOutputFormat,
        isNewTarget: isNewTarget,
        batches: batch,
        sources,
      };
    }
    span.end();
  }

  private createPartSources(part: UnifiedPart, grid: Grid, destPath: string): TaskSources[] {
    this.logger.debug({ msg: 'Creating source layers' });

    const sourceEntry: TaskSources = { type: this.tilesStorageProvider, path: destPath };
    const fileExtension = fileExtensionExtractor(part.fileName);

    const source: TaskSources = {
      type: fileExtension.toUpperCase(),
      path: part.tilesPath,
      grid,
      extent: {
        minX: part.extent[0],
        minY: part.extent[1],
        maxX: part.extent[2],
        maxY: part.extent[3],
      },
    };

    return [sourceEntry, source];
  }

  private *segmentEachGenerator<T extends GeoJsonProperties>(geojson: Feature<LineString, T>): Generator<Feature<LineString, T>> {
    const {
      geometry: { coordinates },
      properties,
    } = geojson;

    for (let i = 0; i < coordinates.length - 1; i++) {
      // Create a LineString segment between consecutive coordinates
      const segmentGeometry = {
        type: 'LineString' as const,
        coordinates: [coordinates[i], coordinates[i + 1]],
      };

      // Create a Feature from the segment
      const segment = {
        type: 'Feature' as const,
        properties,
        geometry: segmentGeometry,
      };

      yield segment;
    }
  }

  private *tileMatrixLimitsGenerator(
    lineString: Feature<LineString, PolygonPartsFindResponseFeatureProperties>,
    mergeParams: MergeLowResolutionParameters,
    stepSize: number
  ): Generator<MergeTaskParameters, void, void> {
    const span = this.tracer.startSpan(`${TileMergeTaskManager.name}.${this.tileMatrixLimitsGenerator.name}`);

    // Pass each line string into the selected algorithm that transfers line segment into tile range
    const tileRangeGenerator = getTileRangeBresenham({ lineString, stepSize, zoom: mergeParams.zoom }); // TODO: rename to getTileRange and provide the algorithm as parameter
    for (const tileRange of tileRangeGenerator) {
      yield* this.createLowResolutionTasks(tileRange, mergeParams, span);
    }

    span.end();
  }

  /**
   * @futureUse This function may be needed for upcoming features(two or more ingestion sources).
   */
  /* istanbul ignore next */
  // private *findPartsIntersections(parts: PartSourceContext[]): Generator<PartsIntersection, void, void> {
  //   this.logger.debug({ msg: 'Searching for parts intersection' });

  //   //In current implementation we are supporting one file ingestion per layer so we can assume that the layers are not intersect and we can yield them as is
  //   let state: IntersectionState = { currentIntersection: null, accumulatedIntersection: null };

  //   const subGroups = subGroupsGen(parts, parts.length, false);
  //   for (const subGroup of subGroups) {
  //     const subGroupFootprints = subGroup.map((layer) => layer.footprint as Footprint);
  //     this.logger.debug({ msg: 'Processing sub group' });
  //     try {
  //       state = this.calculateIntersectionState(state, subGroupFootprints);
  //       if (state.currentIntersection) {
  //         this.logger.debug({ msg: 'Yielding part intersection', intersection: state.currentIntersection });
  //         yield {
  //           parts: subGroup,
  //           intersection: state.currentIntersection,
  //         };
  //       }
  //       yield {
  //         parts: subGroup,
  //         intersection: null,
  //       };
  //     } catch (error) {
  //       const errorMsg = (error as Error).message;
  //       this.logger.error({ msg: `Failed to calculate intersection, error: ${errorMsg}`, error });
  //       throw error;
  //     }
  //   }

  //   this.logger.info({ msg: `Completed finding parts intersection` });
  // }

  // private calculateIntersectionState(state: IntersectionState, subGroupFootprints: Footprint[]): IntersectionState {
  //   const logger = this.logger.child({ intersectionState: state });
  //   logger.debug({ msg: 'Calculating intersection for current subGroup' });

  //   // Calculate the intersection of all footprints in the subgroup
  //   const intersection = multiIntersect(subGroupFootprints);
  //   if (!intersection) {
  //     // If no intersection is found, return the state with null current intersection
  //     logger.debug({ msg: 'No intersection found for the current subgroup' });
  //     return { ...state, currentIntersection: null };
  //   }

  //   if (!state.accumulatedIntersection) {
  //     // If there's no accumulated intersection yet, return the current intersection as both current and accumulated
  //     logger.debug({ msg: 'No accumulated intersection yet (first iteration), returning current intersection' });
  //     return {
  //       currentIntersection: intersection,
  //       accumulatedIntersection: intersection,
  //     };
  //   }

  //   // Calculate the difference between the current intersection and the accumulated intersection
  //   const intersectionDifference = this.calculateIntersectionDifference(intersection, state.accumulatedIntersection);
  //   logger.debug({
  //     msg: 'new intersection calculated by difference between current intersection and accumulated intersection',
  //     intersectionDifference,
  //   });

  //   if (!intersectionDifference) {
  //     // If no new intersection is found, return the state with null current intersection
  //     logger.debug({
  //       msg: 'no difference found between current intersection and accumulated intersection',
  //     });
  //     return { ...state, currentIntersection: null };
  //   }

  //   logger.debug({ msg: 'calculating union of accumulated intersection and intersection difference', intersectionDifference });
  //   //Calculate the union of the accumulated intersection and the new intersection and return the updated state with the new intersection and accumulated intersection
  //   const newAccumulatedIntersection = this.calculateNewAccumulatedIntersection(state.accumulatedIntersection, intersectionDifference);

  //   return {
  //     currentIntersection: intersectionDifference,
  //     accumulatedIntersection: newAccumulatedIntersection,
  //   };
  // }

  // private calculateIntersectionDifference(intersection: Footprint, accumulatedIntersection: Footprint): Footprint | null {
  //   const differenceFeatureCollection = featureCollection([convertToFeature(intersection), convertToFeature(accumulatedIntersection)]);
  //   return difference(differenceFeatureCollection);
  // }

  // private calculateNewAccumulatedIntersection(accumulatedIntersection: Footprint, intersectionDifference: Footprint): Footprint | null {
  //   const unionFeatureCollection = featureCollection([convertToFeature(accumulatedIntersection), convertToFeature(intersectionDifference)]);
  //   return union(unionFeatureCollection);
  // }
}
