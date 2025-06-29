import type { IConfig } from 'config';
import type { Logger } from '@map-colonies/js-logger';
import type { IJobResponse } from '@map-colonies/mc-priority-queue';
import type { LayerName } from '@map-colonies/raster-shared';
import type { IHttpRetryConfig } from '@map-colonies/mc-utils';
import { HttpClient } from '@map-colonies/mc-utils';
import type { IRasterCatalogUpsertRequestBody } from '@map-colonies/mc-model-types';
import { LayerMetadata, Link } from '@map-colonies/mc-model-types';
import { RecordType } from '@map-colonies/types';
import { context, SpanStatusCode, trace, Tracer } from '@opentelemetry/api';
import { inject, injectable } from 'tsyringe';
import { IngestionNewFinalizeJob, IngestionSwapUpdateFinalizeJob, IngestionUpdateFinalizeJob } from '../utils/zod/schemas/job.schema';
import { SERVICES } from '../common/constants';
import type { IngestionNewExtendedJobParams, CatalogUpdateRequestBody, FindLayerResponse, FindLayerBody } from '../common/interfaces';
import { internalIdSchema } from '../utils/zod/schemas/jobParameters.schema';
import { LayerNotFoundError, PublishLayerError, UpdateLayerError } from '../common/errors';
import { LinkBuilder, type ILinkBuilderData } from '../utils/linkBuilder';
import { PolygonPartsMangerClient } from './polygonPartsMangerClient';

@injectable()
export class CatalogClient extends HttpClient {
  private readonly mapproxyDns: string;
  private readonly geoserverDns: string;
  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.LOGGER) protected readonly logger: Logger,
    @inject(SERVICES.TRACER) private readonly tracer: Tracer,
    private readonly linkBuilder: LinkBuilder,
    private readonly polygonPartsMangerClient: PolygonPartsMangerClient
  ) {
    const serviceName = 'RasterCatalogManager';
    const baseUrl = config.get<string>('servicesUrl.catalogManager');
    const httpRetryConfig = config.get<IHttpRetryConfig>('httpRetry');
    const disableHttpClientLogs = config.get<boolean>('disableHttpClientLogs');
    super(logger, baseUrl, serviceName, httpRetryConfig, disableHttpClientLogs);
    this.mapproxyDns = config.get<string>('servicesUrl.mapproxyDns');
    this.geoserverDns = config.get<string>('servicesUrl.geoserverDns');
  }

  public async publish(job: IngestionNewFinalizeJob, layerName: LayerName): Promise<void> {
    await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${CatalogClient.name}.${this.publish.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();
      activeSpan?.setAttribute('layerName', layerName);
      try {
        const url = '/records';
        const publishReq: IRasterCatalogUpsertRequestBody = await this.createPublishReqBody(job, layerName);

        activeSpan?.addEvent('createPublishReqBody.created', {
          metadata: JSON.stringify(publishReq.metadata),
          links: JSON.stringify(publishReq.links),
        });
        await this.post(url, publishReq);
        activeSpan?.setStatus({ code: SpanStatusCode.OK, message: 'Layer published successfully to catalog' });
      } catch (err) {
        if (err instanceof Error) {
          activeSpan?.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          activeSpan?.recordException(err);
          throw new PublishLayerError(this.targetService, layerName, err);
        }
      } finally {
        activeSpan?.end();
      }
    });
  }

  public async update(job: IngestionUpdateFinalizeJob | IngestionSwapUpdateFinalizeJob): Promise<void> {
    await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${CatalogClient.name}.${this.update.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();
      const internalId = internalIdSchema.parse(job).internalId;
      const url = `/records/${internalId}`;

      try {
        const updateReq: CatalogUpdateRequestBody = await this.createUpdateReqBody(job);

        activeSpan?.setAttributes({ internalId, metadata: JSON.stringify(updateReq) });
        activeSpan?.addEvent('createUpdateReqBody.created');

        await this.put(url, updateReq);
        activeSpan?.setStatus({ code: SpanStatusCode.OK, message: 'Layer updated successfully' });
      } catch (err) {
        if (err instanceof Error) {
          activeSpan?.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          activeSpan?.recordException(err);
          throw new UpdateLayerError(this.targetService, internalId, err);
        }
      } finally {
        activeSpan?.end();
      }
    });
  }

  public async findLayer(id: string): Promise<FindLayerResponse> {
    // eslint-disable-next-line @typescript-eslint/return-await
    return await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${CatalogClient.name}.${this.findLayer.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();
      try {
        const url = `/records/find`;
        const requestBody: FindLayerBody = { id };
        activeSpan?.setAttributes({ url, requestBody: JSON.stringify(requestBody) });

        activeSpan?.addEvent('findLayer.request');
        const records = await this.post<FindLayerResponse[]>(url, requestBody);
        activeSpan?.addEvent('findLayer.response', { records: JSON.stringify(records) });

        if (records.length === 0) {
          throw new LayerNotFoundError(id);
        }
        activeSpan?.setStatus({ code: SpanStatusCode.OK, message: 'Layer found successfully' });
        return records[0];
      } catch (err) {
        if (err instanceof Error) {
          activeSpan?.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          activeSpan?.recordException(err);
        }
        throw err;
      } finally {
        activeSpan?.end();
      }
    });
  }

  private async createPublishReqBody(
    job: IJobResponse<IngestionNewExtendedJobParams, unknown>,
    layerName: LayerName
  ): Promise<IRasterCatalogUpsertRequestBody> {
    const metadata = await this.mapToPublishCatalogRecordMetadata(job);

    const links = this.buildLinks(layerName);

    return {
      metadata,
      links,
    };
  }

  private async mapToPublishCatalogRecordMetadata(job: IngestionNewFinalizeJob): Promise<LayerMetadata> {
    const { parameters, version } = job;
    const { metadata, additionalParams } = parameters;
    const { polygonPartsEntityName } = additionalParams;

    const aggregatedLayerMetadata = await this.polygonPartsMangerClient.getAggregatedLayerMetadata(polygonPartsEntityName);

    return {
      id: metadata.catalogId,
      type: RecordType.RECORD_RASTER,
      classification: metadata.classification,
      productName: metadata.productName,
      description: metadata.description,
      srs: metadata.srs,
      srsName: metadata.srsName,
      producerName: metadata.producerName,
      region: metadata.region,
      productId: metadata.productId,
      productType: metadata.productType,
      productSubType: metadata.productSubType,
      displayPath: metadata.displayPath,
      transparency: metadata.transparency,
      scale: metadata.scale,
      tileMimeFormat: metadata.tileMimeType,
      tileOutputFormat: metadata.tileOutputFormat,
      productVersion: version,
      rms: undefined,
      ...aggregatedLayerMetadata,
    };
  }

  private buildLinks(layerName: LayerName): Link[] {
    const linkBuildData: ILinkBuilderData = {
      layerName,
      mapproxyDns: this.mapproxyDns,
      geoserverDns: this.geoserverDns,
    };

    return this.linkBuilder.createLinks(linkBuildData);
  }

  private async createUpdateReqBody(job: IngestionUpdateFinalizeJob | IngestionSwapUpdateFinalizeJob): Promise<CatalogUpdateRequestBody> {
    // eslint-disable-next-line @typescript-eslint/return-await
    return await context.with(
      trace.setSpan(context.active(), this.tracer.startSpan(`${CatalogClient.name}.${this.createUpdateReqBody.name}`)),
      async () => {
        const activeSpan = trace.getActiveSpan();

        try {
          const { parameters, version } = job;
          const { metadata, additionalParams } = parameters;
          const { polygonPartsEntityName, displayPath } = additionalParams;

          activeSpan?.addEvent('getAggregatedLayerMetadata.start', { polygonPartsEntityName });
          const aggregatedLayerMetadata = await this.polygonPartsMangerClient.getAggregatedLayerMetadata(polygonPartsEntityName);
          activeSpan?.addEvent('getAggregatedLayerMetadata.success', { aggregatedLayerMetadata: JSON.stringify(aggregatedLayerMetadata) });

          activeSpan?.setStatus({ code: SpanStatusCode.OK, message: 'Update request body created successfully' });

          return {
            metadata: {
              productVersion: version,
              classification: metadata.classification,
              ingestionDate: new Date(),
              ...(displayPath != undefined && { displayPath }),
              ...aggregatedLayerMetadata,
            },
          };
        } catch (err) {
          if (err instanceof Error) {
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
}
