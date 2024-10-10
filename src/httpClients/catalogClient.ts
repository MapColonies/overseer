import { IConfig } from 'config';
import { Logger } from '@map-colonies/js-logger';
import { IJobResponse } from '@map-colonies/mc-priority-queue';
import { HttpClient, IHttpRetryConfig } from '@map-colonies/mc-utils';
import { IRasterCatalogUpsertRequestBody, LayerMetadata, Link, RecordType } from '@map-colonies/mc-model-types';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../common/constants';
import { ExtendedNewRasterLayer } from '../common/interfaces';
import { PublishLayerError } from '../common/errors';
import { ILinkBuilderData, LinkBuilder } from '../utils/linkBuilder';
import { PolygonPartMangerClient } from './polygonPartMangerClient';

@injectable()
export class CatalogClient extends HttpClient {
  private readonly mapproxyDns: string;
  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.LOGGER) protected readonly logger: Logger,
    private readonly linkBuilder: LinkBuilder,
    private readonly polygonPartMangerClient: PolygonPartMangerClient
  ) {
    const serviceName = 'RasterCatalogManager';
    const baseUrl = config.get<string>('servicesUrl.catalogManager');
    const httpRetryConfig = config.get<IHttpRetryConfig>('httpRetry');
    const disableHttpClientLogs = config.get<boolean>('disableHttpClientLogs');
    super(logger, baseUrl, serviceName, httpRetryConfig, disableHttpClientLogs);
    this.mapproxyDns = config.get<string>('servicesUrl.mapproxyDns');
  }

  public async publish(job: IJobResponse<ExtendedNewRasterLayer, unknown>, layerName: string): Promise<void> {
    try {
      const url = '/records';
      const publishReq: IRasterCatalogUpsertRequestBody = this.createPublishReqBody(job, layerName);
      await this.post(url, publishReq);
    } catch (err) {
      if (err instanceof Error) {
        throw new PublishLayerError(this.targetService, layerName, err);
      }
    }
  }

  private createPublishReqBody(job: IJobResponse<ExtendedNewRasterLayer, unknown>, layerName: string): IRasterCatalogUpsertRequestBody {
    const metadata = this.mapToCatalogRecordMetadata(job);
    const links = this.buildLinks(layerName);

    return {
      metadata,
      links,
    };
  }

  private mapToCatalogRecordMetadata(job: IJobResponse<ExtendedNewRasterLayer, unknown>): LayerMetadata {
    const { parameters, version } = job;
    const { partData, metadata } = parameters;

    const aggregatedPartData = this.polygonPartMangerClient.getAggregatedPartData(partData);

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
