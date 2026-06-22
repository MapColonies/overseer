import type { Mocked, MockedFunction } from 'vitest';
import type { Link } from '@map-colonies/mc-model-types';
import type { z } from 'zod';
import type { AggregationFeature, aggregationFeaturePropertiesSchema, LayerNameFormats } from '@map-colonies/raster-shared';
import { CORE_VALIDATIONS, INGESTION_VALIDATIONS } from '@map-colonies/raster-shared';
import { faker } from '@faker-js/faker';
import { getTestLogger } from '../../configurations/testLogger';
import type { ILinkBuilderData, LinkBuilder } from '../../../src/utils/linkBuilder';
import { configMock, registerDefaultConfig } from '../mocks/configMock';
import { CatalogClient } from '../../../src/httpClients/catalogClient';
import type { PolygonPartsMangerClient } from '../../../src/httpClients/polygonPartsMangerClient';
import { createFakeBBox, createFakePolygonalGeometry } from '../mocks/geometryMockData';
import { tracerMock } from '../mocks/tracerMock';
import type { AggregationLayerMetadata } from '../../../src/common/interfaces';

export type MockCreateLinks = MockedFunction<(data: ILinkBuilderData) => Link[]>;

export interface CatalogClientTestContext {
  createLinksMock: MockCreateLinks;
  catalogClient: CatalogClient;
  polygonPartsManagerClientMock: Mocked<PolygonPartsMangerClient>;
}

export async function setupCatalogClientTest(): Promise<CatalogClientTestContext> {
  registerDefaultConfig();
  const createLinksMock = vi.fn() as MockCreateLinks;
  const linkBuilder = {
    createLinks: createLinksMock,
  } as unknown as LinkBuilder;

  const polygonPartsManagerClientMock = {
    getAggregatedLayerMetadata: vi.fn(),
  } as unknown as Mocked<PolygonPartsMangerClient>;

  const catalogClient = new CatalogClient(configMock, await getTestLogger(), tracerMock, linkBuilder, polygonPartsManagerClientMock);

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

export const createFakeAggregatedPartData = (): AggregationLayerMetadata => {
  const aggregationProps = createFakeAggregationProperties();
  return {
    footprint: createFakePolygonalGeometry(),
    ...aggregationProps,
  };
};

export const createFakeAggregatedFeature = (): AggregationFeature => {
  return {
    geometry: createFakePolygonalGeometry(),
    type: 'Feature',
    properties: createFakeAggregationProperties(),
  };
};

export const layerNameFormats: LayerNameFormats = {
  layerName: 'layer-Orthophoto',
  polygonPartsEntityName: 'layer_orthophoto',
};
