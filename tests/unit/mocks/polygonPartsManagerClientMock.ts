import { PolygonPartsMangerClient } from '../../../src/httpClients/polygonPartsMangerClient';

export const polygonPartsManagerClientMock = {
  process: jest.fn(),
  getAggregatedLayerMetadata: jest.fn(),
} as unknown as jest.Mocked<PolygonPartsMangerClient>;
