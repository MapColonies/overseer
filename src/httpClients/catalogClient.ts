import { IConfig } from 'config';
import { Logger } from '@map-colonies/js-logger';
import { IJobResponse } from '@map-colonies/mc-priority-queue';
import { HttpClient, IHttpRetryConfig } from '@map-colonies/mc-utils';
import {
  IngestionUpdateJobParams,
  IRasterCatalogUpsertRequestBody,
  LayerMetadata,
  Link,
  polygonPartsEntityNameSchema,
  RecordType,
} from '@map-colonies/mc-model-types';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../common/constants';
import { ExtendedNewRasterLayer, CatalogUpdateRequestBody, LayerName } from '../common/interfaces';
import { catalogUpdateAdditionalParamsSchema, internalIdSchema } from '../utils/zod/schemas/jobParametersSchema';
import { PublishLayerError, UpdateLayerError } from '../common/errors';
import { ILinkBuilderData, LinkBuilder } from '../utils/linkBuilder';
import { PolygonPartsMangerClient } from './polygonPartsMangerClient';

@injectable()
export class CatalogClient extends HttpClient {
  private readonly mapproxyDns: string;
  private readonly geoserverDns: string;
  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.LOGGER) protected readonly logger: Logger,
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

  public async publish(job: IJobResponse<ExtendedNewRasterLayer, unknown>, layerName: LayerName): Promise<void> {
    try {
      const url = '/records';
      const publishReq: IRasterCatalogUpsertRequestBody = await this.createPublishReqBody(job, layerName);
      await this.post(url, publishReq);
    } catch (err) {
      if (err instanceof Error) {
        throw new PublishLayerError(this.targetService, layerName, err);
      }
    }
  }

  public async update(job: IJobResponse<IngestionUpdateJobParams, unknown>): Promise<void> {
    const internalId = internalIdSchema.parse(job).internalId;
    const url = `/records/${internalId}`;
    const updateReq: CatalogUpdateRequestBody = await this.createUpdateReqBody(job);
    try {
      await this.put(url, updateReq);
    } catch (err) {
      if (err instanceof Error) {
        throw new UpdateLayerError(this.targetService, internalId, err);
      }
    }
  }

  private async createPublishReqBody(
    job: IJobResponse<ExtendedNewRasterLayer, unknown>,
    layerName: LayerName
  ): Promise<IRasterCatalogUpsertRequestBody> {
    const metadata = await this.mapToPublishCatalogRecordMetadata(job);

    const links = this.buildLinks(layerName);

    return {
      metadata,
      links,
    };
  }

  private async mapToPublishCatalogRecordMetadata(job: IJobResponse<ExtendedNewRasterLayer, unknown>): Promise<LayerMetadata> {
    const { parameters, version } = job;
    const { metadata, additionalParams } = parameters;

    const validAdditionalParams = polygonPartsEntityNameSchema.parse(additionalParams);

    const { polygonPartsEntityName } = validAdditionalParams;

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
      updateDateUTC: undefined,
      creationDateUTC: undefined,
      rms: undefined,
      ingestionDate: undefined,
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

  private async createUpdateReqBody(job: IJobResponse<IngestionUpdateJobParams, unknown>): Promise<CatalogUpdateRequestBody> {
    const { parameters, version } = job;
    const { metadata, additionalParams } = parameters;

    const validAdditionalParams = catalogUpdateAdditionalParamsSchema.parse(additionalParams);
    const { displayPath, polygonPartsEntityName } = validAdditionalParams;
    const aggregatedPartData = await this.polygonPartsMangerClient.getAggregatedLayerMetadata(polygonPartsEntityName);

    return {
      metadata: {
        productVersion: version,
        classification: metadata.classification,
        displayPath,
        ...aggregatedPartData,
      },
    };
  }
}
