import { IConfig } from 'config';
import { Logger } from '@map-colonies/js-logger';
import { IJobResponse } from '@map-colonies/mc-priority-queue';
import { HttpClient, IHttpRetryConfig } from '@map-colonies/mc-utils';
import { IRasterCatalogUpsertRequestBody, LayerMetadata, Link, PolygonPart, RecordType } from '@map-colonies/mc-model-types';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../common/constants';
import { ExtendedNewRasterLayer, PartAggregatedData } from '../common/interfaces';
import { ILinkBuilderData, LinkBuilder } from '../utils/linkBuilder';

@injectable()
export class CatalogClient extends HttpClient {
  private readonly mapproxyDns: string;
  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.LOGGER) protected readonly logger: Logger,
    @inject(LinkBuilder) private readonly linkBuilder: LinkBuilder
  ) {
    const serviceName = 'RasterCatalogManager';
    const baseUrl = config.get<string>('servicesUrl.catalogManager');
    const httpRetryConfig = config.get<IHttpRetryConfig>('httpRetry');
    const disableHttpClientLogs = config.get<boolean>('disableHttpClientLogs');
    super(logger, baseUrl, serviceName, httpRetryConfig, disableHttpClientLogs);
    this.mapproxyDns = config.get<string>('servicesUrl.mapproxyDns');
  }

  public async publishLayer(job: IJobResponse<ExtendedNewRasterLayer, unknown>, layerName: string): Promise<void> {
    const url = '/records';
    const publishReq: IRasterCatalogUpsertRequestBody = this.createPublishReqBody(job, layerName);
    await this.post(url, publishReq);
  }

  private createPublishReqBody(job: IJobResponse<ExtendedNewRasterLayer, unknown>, layerName: string): IRasterCatalogUpsertRequestBody {
    const metadata = this.mapToCatalogRecordMetadata(job);
    const links = this.buildLinks(layerName);

    return {
      metadata,
      links,
    };
  }

  private getAggregatedPartData(partsData: PolygonPart[]): PartAggregatedData {
    //later we should send request to PolygonPartsManager to get aggregated data

    return {
      imagingTimeBeginUTC: partsData[0].imagingTimeBeginUTC,
      imagingTimeEndUTC: partsData[0].imagingTimeEndUTC,
      minHorizontalAccuracyCE90: partsData[0].horizontalAccuracyCE90,
      maxHorizontalAccuracyCE90: partsData[0].horizontalAccuracyCE90,
      sensors: partsData[0].sensors,
      maxResolutionDeg: partsData[0].resolutionDegree,
      minResolutionDeg: partsData[0].resolutionDegree,
      maxResolutionMeter: partsData[0].resolutionMeter,
      minResolutionMeter: partsData[0].resolutionMeter,
      footprint: partsData[0].footprint,
      productBoundingBox: '',
    };
  }

  private mapToCatalogRecordMetadata(job: IJobResponse<ExtendedNewRasterLayer, unknown>): LayerMetadata {
    const { parameters, version } = job;
    const { partData, metadata } = parameters;

    const aggregatedPartData = this.getAggregatedPartData(partData);

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
      ingestionDate: new Date(),
      ...aggregatedPartData,
    };
  }

  private buildLinks(layerName: string): Link[] {
    const linkBuildData: ILinkBuilderData = {
      layerName,
      serverUrl: this.mapproxyDns,
    };

    return this.linkBuilder.createLinks(linkBuildData);
  }
}
