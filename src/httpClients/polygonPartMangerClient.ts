import { IConfig } from 'config';
import { Logger } from '@map-colonies/js-logger';
import { PolygonPart } from '@map-colonies/mc-model-types';
import { HttpClient, IHttpRetryConfig } from '@map-colonies/mc-utils';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../common/constants';
import { PartAggregatedData } from '../common/interfaces';

@injectable()
export class PolygonPartMangerClient extends HttpClient {
  public constructor(@inject(SERVICES.CONFIG) private readonly config: IConfig, @inject(SERVICES.LOGGER) protected readonly logger: Logger) {
    const serviceName = 'PolygonPartManger';
    const baseUrl = config.get<string>('servicesUrl.polygonPartManager');
    const httpRetryConfig = config.get<IHttpRetryConfig>('httpRetry');
    const disableHttpClientLogs = config.get<boolean>('disableHttpClientLogs');
    super(logger, baseUrl, serviceName, httpRetryConfig, disableHttpClientLogs);
  }

  public getAggregatedPartData(partsData: PolygonPart[]): PartAggregatedData {
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
      productBoundingBox: '-180,90,180,90',
    };
  }
}
