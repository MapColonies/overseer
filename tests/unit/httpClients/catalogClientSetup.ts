/* eslint-disable @typescript-eslint/naming-convention */
import { Link } from '@map-colonies/mc-model-types';
import jsLogger from '@map-colonies/js-logger';
import { z } from 'zod';
import { AggregationFeature, aggregationFeaturePropertiesSchema, CORE_VALIDATIONS, INGESTION_VALIDATIONS } from '@map-colonies/raster-shared';
import { faker } from '@faker-js/faker';
import { ILinkBuilderData, LinkBuilder } from '../../../src/utils/linkBuilder';
import { configMock, registerDefaultConfig } from '../mocks/configMock';
import { CatalogClient } from '../../../src/httpClients/catalogClient';
import { PolygonPartsMangerClient } from '../../../src/httpClients/polygonPartsMangerClient';
import { PartAggregatedData } from '../../../src/common/interfaces';
import { createFakeBBox, createFakeRandomPolygonalGeometry } from '../mocks/partsMockData';
import { IngestionJobTypes } from '../../../src/utils/configUtil';
import { tracerMock } from '../mocks/tracerMock';

const jobTypes: IngestionJobTypes = {
  Ingestion_New: 'Ingestion_New',
  Ingestion_Update: 'Ingestion_Update',
  Ingestion_Swap_Update: 'Ingestion_Swap_Update',
  Export: 'Export',
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

  const catalogClient = new CatalogClient(configMock, jsLogger({ enabled: false }), tracerMock, jobTypes, linkBuilder, polygonPartsManagerClientMock);

  return {
    createLinksMock,
    catalogClient,
    polygonPartsManagerClientMock,
  };
}

export const linksMockData: Link[] = [];

export const createFakeAggregationProperties = (): z.infer<typeof aggregationFeaturePropertiesSchema> => {
  const resolutionMeter = faker.number.float(INGESTION_VALIDATIONS.resolutionMeter);
  const horizontalAccuracyCE90 = faker.number.int(INGESTION_VALIDATIONS.horizontalAccuracyCE90);
  const resolutionDeg = faker.number.float(CORE_VALIDATIONS.resolutionDeg);
  return {
    imagingTimeBeginUTC: faker.date.past(),
    imagingTimeEndUTC: faker.date.recent(),
    maxResolutionMeter: resolutionMeter,
    minResolutionMeter: resolutionMeter,
    maxHorizontalAccuracyCE90: horizontalAccuracyCE90,
    minHorizontalAccuracyCE90: horizontalAccuracyCE90,
    maxResolutionDeg: resolutionDeg,
    minResolutionDeg: resolutionDeg,
    productBoundingBox: createFakeBBox().toString(),
    sensors: [faker.word.noun()],
  };
};

export const createFakeAggregatedPartData = (): PartAggregatedData => {
  const aggregationProps = createFakeAggregationProperties();
  return {
    footprint: createFakeRandomPolygonalGeometry(),
    ...aggregationProps,
  };
};

export const createFakeAggregatedFeature = (): AggregationFeature => {
  return {
    geometry: createFakeRandomPolygonalGeometry(),
    type: 'Feature',
    properties: createFakeAggregationProperties(),
  };
};
