import FS from 'fs';
import { ILinkBuilderData, LinkBuilder } from '../../../src/utils/linkBuilder';
import { configMock, registerDefaultConfig } from '../mocks/configMock';
import { getExpectedLinks, linksTemplate } from '../mocks/linksBuilderUtils';

let linkBuilder: LinkBuilder;

describe('LinkBuilder', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    registerDefaultConfig();
  });
  describe('createLinks', () => {
    it('should return links for a given layer', () => {
      linkBuilder = new LinkBuilder(configMock);
      const serverUrl = configMock.get<string>('servicesUrl.mapproxyDns');

      const linkBuilderData: ILinkBuilderData = {
        serverUrl,
        layerName: 'testLayer',
      };

      const expectedLinks = getExpectedLinks(serverUrl, linkBuilderData.layerName);

      jest.spyOn(FS, 'readFileSync').mockReturnValue(linksTemplate);
      const actualLinks = linkBuilder.createLinks(linkBuilderData);

      expect(actualLinks).toEqual(expectedLinks);
    });
  });
});
