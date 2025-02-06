/* eslint-disable @typescript-eslint/naming-convention */
import { Link } from '@map-colonies/mc-model-types';
import jsLogger from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { faker } from '@faker-js/faker';
import { ILinkBuilderData, LinkBuilder } from '../../../src/utils/linkBuilder';
import { configMock, registerDefaultConfig } from '../mocks/configMock';
import { CatalogClient } from '../../../src/httpClients/catalogClient';
import { PolygonPartsMangerClient } from '../../../src/httpClients/polygonPartsMangerClient';
import { PartAggregatedData } from '../../../src/common/interfaces';
import { createFakeBBox, createFakePolygon } from '../mocks/partsMockData';
import { IngestionJobTypes } from '../../../src/utils/configUtil';

const jobTypes: IngestionJobTypes = {
  Ingestion_New: 'Ingestion_New',
  Ingestion_Update: 'Ingestion_Update',
  Ingestion_Swap_Update: 'Ingestion_Swap_Update',
  Raster_Tiles_Exporter: 'Raster_Tiles_Exporter',
};

export type MockCreateLinks = jest.MockedFunction<(data: ILinkBuilderData) => Link[]>;

export interface CatalogClientTestContext {
  createLinksMock: MockCreateLinks;
  catalogClient: CatalogClient;
  polygonPartsManagerClientMock: jest.Mocked<PolygonPartsMangerClient>;
}

export function setupCatalogClientTest(): CatalogClientTestContext {
  registerDefaultConfig();
  const createLinksMock = jest.fn() as MockCreateLinks;
  const linkBuilder = {
    createLinks: createLinksMock,
  } as unknown as LinkBuilder;

  const polygonPartsManagerClientMock = {
    getAggregatedLayerMetadata: jest.fn(),
  } as unknown as jest.Mocked<PolygonPartsMangerClient>;

  const tracerMock = trace.getTracer('test');
  const catalogClient = new CatalogClient(configMock, jsLogger({ enabled: false }), tracerMock, jobTypes, linkBuilder, polygonPartsManagerClientMock);

  return {
    createLinksMock,
    catalogClient,
    polygonPartsManagerClientMock,
  };
}

export const linksMockData: Link[] = [];

export const createFakeAggregatedPartData = (): PartAggregatedData => {
  return {
    footprint: createFakePolygon(),
    imagingTimeBeginUTC: faker.date.recent(),
    imagingTimeEndUTC: faker.date.recent(),
    maxHorizontalAccuracyCE90: faker.number.int(),
    maxResolutionDeg: faker.number.float(),
    maxResolutionMeter: faker.number.int(),
    minHorizontalAccuracyCE90: faker.number.int(),
    minResolutionDeg: faker.number.float(),
    minResolutionMeter: faker.number.int(),
    productBoundingBox: createFakeBBox().toString(),
    sensors: [faker.word.noun()],
  };
};
