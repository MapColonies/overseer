import type { Mocked } from 'vitest';
import type { PolygonPartsMangerClient } from '../../../src/httpClients/polygonPartsMangerClient';

export const polygonPartsManagerClientMock = {
  process: vi.fn(),
  getAggregatedLayerMetadata: vi.fn(),
} as unknown as Mocked<PolygonPartsMangerClient>;
