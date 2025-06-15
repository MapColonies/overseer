import { Logger } from '@map-colonies/js-logger';
import { PolygonPart } from '@map-colonies/raster-shared';
import { degreesPerPixelToZoomLevel, getUTCDate, zoomLevelToResolutionDeg, featureToTilesCount } from '@map-colonies/mc-utils';
import { feature, featureCollection, union, bbox, bboxPolygon, intersect } from '@turf/turf';
import { BBox, Feature, MultiPolygon, Polygon } from 'geojson';
import { ICreateJobBody, ICreateTaskBody, OperationStatus, TaskHandler as QueueClient } from '@map-colonies/mc-priority-queue';
import { inject, injectable } from 'tsyringe';
import { context, SpanStatusCode, trace, Tracer } from '@opentelemetry/api';
import { LayerCacheType, SeedMode, SERVICES } from '../../../common/constants';
import { Footprint, IConfig, SeedJobParams, SeedTaskOptions, SeedTaskParams, TilesSeedingTaskConfig } from '../../../common/interfaces';
import { MapproxyApiClient } from '../../../httpClients/mapproxyClient';
import { internalIdSchema } from '../../../utils/zod/schemas/jobParameters.schema';
import { IngestionSwapUpdateFinalizeJob, IngestionUpdateFinalizeJob } from '../../../utils/zod/schemas/job.schema';
import { extractMaxUpdateZoomLevel } from '../../../utils/partsDataUtil';

@injectable()
export class SeedingJobCreator {
  private readonly tilesSeedingConfig: TilesSeedingTaskConfig;
  private readonly seedJobType: string;
  private readonly zoomThreshold: number;
  private readonly maxTilesPerTask: number;
  private readonly updateJobType: string;
  private readonly swapUpdateJobType: string;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.TRACER) private readonly tracer: Tracer,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.QUEUE_CLIENT) protected queueClient: QueueClient,
    @inject(MapproxyApiClient) private readonly mapproxyClient: MapproxyApiClient
  ) {
    this.tilesSeedingConfig = this.config.get<TilesSeedingTaskConfig>('jobManagement.ingestion.tasks.tilesSeeding');
    this.seedJobType = this.config.get<string>('jobManagement.ingestion.jobs.seed.type');
    this.zoomThreshold = this.config.get<number>('jobManagement.ingestion.tasks.tilesSeeding.zoomThreshold') ?? 16;
    this.maxTilesPerTask = this.config.get<number>('jobManagement.ingestion.tasks.tilesSeeding.maxTilesPerTask') ?? 10000;
    this.updateJobType = this.config.get<string>('jobManagement.polling.jobs.update.type');
    this.swapUpdateJobType = this.config.get<string>('jobManagement.polling.jobs.swapUpdate.type');
  }

  public async create({ layerName, ingestionJob }: SeedJobParams): Promise<void> {
    await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${SeedingJobCreator.name}.${this.create.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();
      try {
        const { type: seedTaskType } = this.tilesSeedingConfig;

        const logger = this.logger.child({ ingestionJobId: ingestionJob.id, jobType: this.seedJobType, taskType: seedTaskType });
        logger.info({ msg: 'Starting seeding job creation process' });

        activeSpan?.setAttributes({
          ingestionJobId: ingestionJob.id,
          seedJobType: this.seedJobType,
          seedTaskType,
          layerName,
        });

        logger.debug({ msg: 'Getting cache name for layer', layerName });

        const cacheName = await this.mapproxyClient.getCacheName({ layerName, cacheType: LayerCacheType.REDIS });
        activeSpan?.addEvent('getCacheName.success', { cacheName });

        const validCatalogId = internalIdSchema.parse(ingestionJob).internalId;

        const seedTasks: ICreateTaskBody<SeedTaskParams>[] = [];

        // Handle different modes
        const clearModeTask = this.handleCleanMode(ingestionJob, cacheName, validCatalogId);
        const seedModeTasks = this.handleSeedMode(ingestionJob, cacheName, validCatalogId);

        if (clearModeTask) {
          seedTasks.push(clearModeTask);
        }
        seedTasks.push(...seedModeTasks);

        if (seedTasks.length === 0) {
          logger.warn({ msg: 'No tasks created, skipping job creation' });
          activeSpan?.addEvent('createJob.skipped', { reason: 'No tasks created' });
          return;
        }

        const { resourceId, version, producerName, productType, domain } = ingestionJob;
        const createJobRequest: ICreateJobBody<unknown, SeedTaskParams> = {
          resourceId,
          internalId: validCatalogId,
          version,
          type: this.seedJobType,
          parameters: {},
          status: OperationStatus.IN_PROGRESS,
          producerName: producerName ?? undefined,
          productType,
          domain,
          tasks: seedTasks,
        };

        const res = await this.queueClient.jobManagerClient.createJob(createJobRequest);
        activeSpan?.addEvent('createJob.success', { seedJobId: res.id });
        logger.info({ msg: 'Seeding job created successfully', seedJobId: res.id, seedTaskIds: res.taskIds });
      } catch (err) {
        if (err instanceof Error) {
          activeSpan?.recordException(err);
          activeSpan?.setStatus({ code: SpanStatusCode.ERROR });
          return this.logger.error({ msg: `Failed to create seeding job: ${err.message}`, error: err });
        }
      } finally {
        activeSpan?.end();
      }
    });
  }

  private handleCleanMode(
    job: IngestionUpdateFinalizeJob | IngestionSwapUpdateFinalizeJob,
    cacheName: string,
    catalogId: string
  ): ICreateTaskBody<SeedTaskParams> | void {
    const activeSpan = trace.getActiveSpan();
    const seedTaskType = this.tilesSeedingConfig.type;
    const logger = this.logger.child({ mode: SeedMode.CLEAN, jobId: job.id, catalogId: job.internalId });

    const cleanGeometry = this.calculateGeometryByMode(SeedMode.CLEAN, job);
    if (!cleanGeometry) {
      activeSpan?.addEvent('calculateCleanGeometry.empty');
      logger.warn({ msg: 'No geometry found for CLEAN mode' });
      return;
    }

    activeSpan?.addEvent('calculateCleanGeometry.success', { geometry: JSON.stringify(cleanGeometry) });

    if (job.type === this.swapUpdateJobType) {
      const cleanOptions = this.createSeedOptions(SeedMode.CLEAN, cleanGeometry, cacheName);
      activeSpan?.addEvent('createSeedOptions.success', { seedOptions: JSON.stringify(cleanOptions) });

      const taskParams = this.createTaskParams(catalogId, cleanOptions);
      activeSpan?.addEvent('createTaskParams.success', { taskParams: JSON.stringify(taskParams) });

      return { type: seedTaskType, parameters: taskParams };
    } else if (job.type === this.updateJobType) {
      const maxUpdateZoomLevel = extractMaxUpdateZoomLevel(job);
      if (maxUpdateZoomLevel + 1 <= this.tilesSeedingConfig.maxZoom) {
        const cleanOptions = this.createSeedOptions(SeedMode.CLEAN, cleanGeometry, cacheName, maxUpdateZoomLevel + 1);
        activeSpan?.addEvent('createSeedOptions.success', { seedOptions: JSON.stringify(cleanOptions) });

        const taskParams = this.createTaskParams(catalogId, cleanOptions);
        activeSpan?.addEvent('createTaskParams.success', { taskParams: JSON.stringify(taskParams) });

        return { type: seedTaskType, parameters: taskParams };
      }
    }
    logger.debug({ msg: 'Ingestion Job is not of update type, skipping CLEAN creation' });
    return;
  }

  private handleSeedMode(
    job: IngestionUpdateFinalizeJob | IngestionSwapUpdateFinalizeJob,
    cacheName: string,
    catalogId: string
  ): ICreateTaskBody<SeedTaskParams>[] {
    const activeSpan = trace.getActiveSpan();
    const seedTaskType = this.tilesSeedingConfig.type;
    const seedTasks: ICreateTaskBody<SeedTaskParams>[] = [];

    if (job.type !== this.updateJobType) {
      this.logger.debug({ msg: 'Ingestion Job is not of update type, skipping SEED creation' });
      activeSpan?.addEvent('handleSeedMode.skipped');
      return [];
    }

    const seedGeometry = this.calculateGeometryByMode(SeedMode.SEED, job);
    if (!seedGeometry) {
      activeSpan?.addEvent('calculateSeedGeometry.empty');
      this.logger.warn({ msg: 'No geometry found for SEED mode' });
      return [];
    }

    const partsData = job.parameters.partsData;
    const thresholdZoom = zoomLevelToResolutionDeg(this.zoomThreshold) as number;
    const highZoomParts = partsData.filter((p) => p.resolutionDegree < thresholdZoom);
    const maxUpdatedZoom = extractMaxUpdateZoomLevel(job);

    // Step 1: Handle all res from 0 to zoomThreshold in one seed task
    const seedOptions = this.createSeedOptions(SeedMode.SEED, seedGeometry as Footprint, cacheName, 0, Math.min(maxUpdatedZoom, this.zoomThreshold));
    const taskParams = this.createTaskParams(catalogId, seedOptions);
    seedTasks.push({ type: seedTaskType, parameters: taskParams });

    // Step 2: Handle high-res parts individually by zoom level
    for (const part of highZoomParts) {
      const partZoomLevel = degreesPerPixelToZoomLevel(part.resolutionDegree);
      for (let zoom = this.zoomThreshold + 1; zoom <= Math.min(partZoomLevel, maxUpdatedZoom); zoom++) {
        const estimatedTiles = featureToTilesCount(feature(part.footprint), zoom);

        if (estimatedTiles <= this.maxTilesPerTask) {
          // If tiles count is within limit, create a single task
          const seedOptions = this.createSeedOptions(SeedMode.SEED, part.footprint, cacheName, zoom, zoom);
          const taskParams = this.createTaskParams(catalogId, seedOptions);
          seedTasks.push({ type: seedTaskType, parameters: taskParams });
        } else {
          // If tiles count exceeds limit, split the geometry
          const splitGeometries = this.splitGeometryByTileCount(part.footprint, zoom, this.maxTilesPerTask);
          for (const geometry of splitGeometries) {
            const seedOptions = this.createSeedOptions(SeedMode.SEED, geometry, cacheName, zoom, zoom);
            const taskParams = this.createTaskParams(catalogId, seedOptions);
            seedTasks.push({ type: seedTaskType, parameters: taskParams });
          }
        }
      }
    }

    return seedTasks;
  }

  private splitGeometryByTileCount(geometry: Polygon | MultiPolygon, zoomLevel: number, maxTiles: number): Feature<Polygon | MultiPolygon>[] {
    const geometryBbox = bbox(geometry);
    const [minX, minY, maxX, maxY] = geometryBbox;

    // Calculate total tiles in the bbox
    const totalTiles = featureToTilesCount(feature(geometry), zoomLevel);
    const splitFactor = Math.ceil(Math.sqrt(totalTiles / maxTiles));

    // Calculate step sizes for splitting
    const xStep = (maxX - minX) / splitFactor;
    const yStep = (maxY - minY) / splitFactor;

    const splitGeometries: Feature<Polygon | MultiPolygon>[] = [];

    // Create grid of sub-geometries
    for (let i = 0; i < splitFactor; i++) {
      for (let j = 0; j < splitFactor; j++) {
        const subBbox: BBox = [minX + i * xStep, minY + j * yStep, minX + (i + 1) * xStep, minY + (j + 1) * yStep];

        const subPolygon = bboxPolygon(subBbox);
        const intersection = intersect(featureCollection([subPolygon, feature(geometry)]));

        if (intersection) {
          splitGeometries.push(intersection);
        }
      }
    }

    return splitGeometries;
  }

  private createSeedOptions(mode: SeedMode, geometry: Footprint, cacheName: string, fromZoomLevel?: number, toZoomLevel?: number): SeedTaskOptions {
    const { grid, maxZoom, skipUncached } = this.tilesSeedingConfig;
    const refreshBefore = getUTCDate().toISOString().replace(/\..+/, '');
    return {
      mode,
      grid,
      fromZoomLevel: fromZoomLevel ?? 0,
      toZoomLevel: toZoomLevel ?? maxZoom,
      geometry,
      skipUncached,
      layerId: cacheName,
      refreshBefore,
    };
  }

  private createTaskParams(catalogId: string, seedOptions: SeedTaskOptions): SeedTaskParams {
    return {
      seedTasks: [seedOptions],
      catalogId,
      traceParentContext: undefined, // todo - add tracing
      cacheType: LayerCacheType.REDIS,
    };
  }

  private calculateGeometryByMode(
    mode: SeedMode,
    job: IngestionUpdateFinalizeJob | IngestionSwapUpdateFinalizeJob
  ): Polygon | MultiPolygon | undefined {
    const logger = this.logger.child({ mode });
    logger.debug({ msg: 'Getting geometry for seeding job' });
    if (mode === SeedMode.CLEAN && job.type === this.swapUpdateJobType) {
      const footprint = job.parameters.additionalParams.footprint;
      return footprint;
    }

    const feature = this.unifyParts(job.parameters.partsData);
    const geometry = feature?.geometry;

    return geometry;
  }

  private unifyParts(parts: PolygonPart[]): Feature<Polygon | MultiPolygon> | null {
    if (parts.length === 1) {
      return feature(parts[0].footprint);
    }
    const polygons = parts.map((part) => feature(part.footprint));
    const collection = featureCollection(polygons);
    const footprint = union(collection);
    return footprint;
  }

  // private getSplittedIntersections(seedGeometry: Polygon | MultiPolygon, partArea: number): Feature<Polygon | MultiPolygon>[] {
  //   const seedBbox = bbox(seedGeometry);
  //   const seedFeature = feature(seedGeometry);

  //   const smallBboxes = this.splitBoundingBox(seedBbox, partArea);

  //   const intersectionFeatures: Feature<Polygon | MultiPolygon>[] = [];

  //   for (const tileBbox of smallBboxes) {
  //     // Create a polygon from the small bbox
  //     const tilePolygon = bboxPolygon(tileBbox);

  //     // Find the intersection with the original geometry
  //     try {
  //       const intersection = intersect(featureCollection([tilePolygon, seedFeature]));

  //       // Only add the intersection if it exists (they might not intersect if the original
  //       // geometry had a complex shape and the bbox was just a rough envelope)
  //       if (intersection) {
  //         intersectionFeatures.push(intersection);
  //       }
  //     } catch (error) {
  //       // Handle any turf.js intersection errors
  //       console.warn('Error calculating intersection for tile:', tileBbox, error);
  //       // Skip this tile if there's an error
  //     }
  //   }

  //   return intersectionFeatures;
  // }
  // private calculateDistanceInKm(point1: [number, number], point2: [number, number]): number {
  //   const from = point(point1);
  //   const to = point(point2);
  //   return distance(from, to, { units: 'kilometers' });
  // }

  /**
   * Splits a large bounding box (bbox) into smaller sub-boxes (tiles) such that each tile
   * does not exceed a predefined maximum area threshold (in square kilometers). To achieve this,
   * the function first converts the bbox dimensions from geographic coordinates (degrees) into
   * real-world distances (kilometers) to calculate an accurate aspect ratio. Based on the total
   * area and the maximum tile size, it estimates how many tiles are needed and determines the
   * optimal number of horizontal (X) and vertical (Y) splits to preserve the shape of the original
   * bbox — favoring square-shaped tiles over elongated ones. It then creates a sample tile to
   * verify the actual area after conversion, and if that sample still exceeds the limit, it increases
   * the split count accordingly. Finally, it generates a grid of equally sized sub-bboxes that fully
   * cover the original bbox without overlaps or gaps, ensuring the result is efficient for downstream
   * processing like spatial tiling, rendering, or parallel computation.
   */

  /**  private splitBoundingBox(bbox: BBox, partArea: number): BBox[] {
    const maxTileAreaKm2 = this.areaThresholdKm;

    // We'll determine an appropriate number of splits based on the area ratio
    // and the shape of the bounding box

    // Calculate aspect ratio of the bbox (in terms of distance, not degrees)
    const bboxWidth = this.calculateDistanceInKm([bbox[0], bbox[1]], [bbox[2], bbox[1]]);

    const bboxHeight = this.calculateDistanceInKm([bbox[0], bbox[1]], [bbox[0], bbox[3]]);

    const aspectRatio = bboxWidth / bboxHeight;

    // Calculate how many tiles we need in total
    // Add a buffer by multiplying by 1.2 to ensure we have enough tiles
    const totalTilesNeeded = Math.ceil((partArea / maxTileAreaKm2) * 1.2);

    // Distribute splits according to aspect ratio to maintain roughly square tiles
    // We want more splits along the longer dimension
    let numYSplits, numXSplits;

    /* If it's wider than tall, split more horizontally.
If it's taller than wide, split more vertically.

    if (aspectRatio >= 1) {
      // Width is greater than or equal to height
      numXSplits = Math.ceil(Math.sqrt(totalTilesNeeded * aspectRatio));
      numYSplits = Math.ceil(totalTilesNeeded / numXSplits);
    } else {
      // Height is greater than width
      numYSplits = Math.ceil(Math.sqrt(totalTilesNeeded / aspectRatio));
      numXSplits = Math.ceil(totalTilesNeeded / numYSplits);
    }

    // Make sure we have at least one split in each dimension
    numXSplits = Math.max(1, numXSplits);
    numYSplits = Math.max(1, numYSplits);

    // To guarantee we don't exceed the area threshold without recursion,
    // we might need to add more splits if our initial estimation isn't sufficient

    // First check if our initial split estimate is enough
    const xStep = (bbox[2] - bbox[0]) / numXSplits;
    const yStep = (bbox[3] - bbox[1]) / numYSplits;

    // Check the area of a single tile with our current split configuration
    const sampleBBox: BBox = [bbox[0], bbox[1], bbox[0] + xStep, bbox[1] + yStep];
    const samplePolygon = bboxPolygon(sampleBBox);
    const sampleArea = area(samplePolygon) / 1000000; // km²

    // If our sample tile is still too large, increase the number of splits
    if (sampleArea > maxTileAreaKm2) {
      const areaRatio = sampleArea / maxTileAreaKm2;
      const additionalSplitFactor = Math.ceil(Math.sqrt(areaRatio));

      numXSplits *= additionalSplitFactor;
      numYSplits *= additionalSplitFactor;
    }

    // Recalculate steps with potentially adjusted split counts
    const finalXStep = (bbox[2] - bbox[0]) / numXSplits;
    const finalYStep = (bbox[3] - bbox[1]) / numYSplits;

    // Generate all sub-bboxes
    const resultBBoxes: BBox[] = [];

    for (let yi = 0; yi < numYSplits; yi++) {
      for (let xi = 0; xi < numXSplits; xi++) {
        const minX = bbox[0] + xi * finalXStep;
        const minY = bbox[1] + yi * finalYStep;
        const maxX = Math.min(bbox[2], bbox[0] + (xi + 1) * finalXStep);
        const maxY = Math.min(bbox[3], bbox[1] + (yi + 1) * finalYStep);

        const subBBox: BBox = [minX, minY, maxX, maxY];
        resultBBoxes.push(subBBox);
      }
    }

    return resultBBoxes;
  }*/
}
