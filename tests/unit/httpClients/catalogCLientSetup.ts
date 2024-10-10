import { Link } from '@map-colonies/mc-model-types';
import jsLogger from '@map-colonies/js-logger';
import { ILinkBuilderData, LinkBuilder } from '../../../src/utils/linkBuilder';
import { configMock, registerDefaultConfig } from '../mocks/configMock';
import { CatalogClient } from '../../../src/httpClients/catalogClient';
import { PolygonPartMangerClient } from '../../../src/httpClients/polygonPartMangerClient';

export type MockCreateLinks = jest.MockedFunction<(data: ILinkBuilderData) => Link[]>;

export interface CatalogClientTestContext {
  createLinksMock: MockCreateLinks;
  catalogClient: CatalogClient;
}

export function setupCatalogClientTest(): CatalogClientTestContext {
  registerDefaultConfig();
  const createLinksMock = jest.fn() as MockCreateLinks;
  const linkBuilder = {
    createLinks: createLinksMock,
  } as unknown as LinkBuilder;
  const polygonPartManagerClient = new PolygonPartMangerClient(configMock, jsLogger({ enabled: false }));
  const catalogClient = new CatalogClient(configMock, jsLogger({ enabled: false }), linkBuilder, polygonPartManagerClient);

  return {
    createLinksMock,
    catalogClient,
  };
}

export const linksMockData: Link[] = [];
