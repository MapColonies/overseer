import { TileOutputFormat, Transparency } from '@map-colonies/raster-shared';
import { fileExtensionExtractor } from '../../../src/utils/fileUtil';
import { getTileOutputFormat } from '../../../src/utils/imageFormatUtil';
import { registerDefaultConfig } from '../mocks/configMock';

describe('utils', () => {
  beforeEach(() => {
    registerDefaultConfig();
  });

  describe('fileUtil', () => {
    describe('fileExtensionExtractor', () => {
      it('should return the file extension', () => {
        const fileName = 'test.gpkg';
        const result = fileExtensionExtractor(fileName);
        expect(result).toBe('gpkg');
      });
    });
  });

  describe('imageFormatUtil', () => {
    describe('getImageFormat', () => {
      const testCases = [
        { transparency: Transparency.OPAQUE, expected: TileOutputFormat.JPEG },
        { transparency: Transparency.TRANSPARENT, expected: TileOutputFormat.PNG },
      ];

      test.each(testCases)('should return the image format', ({ transparency, expected }) => {
        const result = getTileOutputFormat(transparency);
        expect(result).toBe(expected);
      });

      it('should throw an error for unsupported transparency', () => {
        const transparency = 'unsupported' as Transparency;
        expect(() => getTileOutputFormat(transparency)).toThrow();
      });
    });
  });
});
