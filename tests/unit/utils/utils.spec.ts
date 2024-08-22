import { TileOutputFormat, Transparency } from '@map-colonies/mc-model-types';
import { Footprint } from '@map-colonies/mc-utils';
import { fileExtensionExtractor } from '../../../src/utils/fileutils';
import { convertToFeature } from '../../../src/utils/geoUtils';
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

  describe('geoUtil', () => {
    describe('convertToFeature', () => {
      it('should convert a polygon footPrint to a feature', () => {
        const footPrint: Footprint = {
          type: 'Polygon',
          coordinates: [
            [
              [125.6, 10.1],
              [125.7, 10.1],
              [125.7, 10.2],
              [125.6, 10.2],
              [125.6, 10.1],
            ],
          ],
        };

        const footPrintFeature = {
          type: 'Feature',
          geometry: footPrint,
          properties: {},
        };
        const result = convertToFeature(footPrint);
        expect(result).toEqual(footPrintFeature);
      });

      it('should convert a MultiPolygon footPrint to a feature', () => {
        const footPrint: Footprint = {
          type: 'MultiPolygon',
          coordinates: [
            [
              [
                [125.6, 10.1],
                [125.7, 10.1],
                [125.7, 10.2],
                [125.6, 10.2],
                [125.6, 10.1],
              ],
            ],
          ],
        };

        const footPrintFeature = {
          type: 'Feature',
          geometry: footPrint,
          properties: {},
        };
        const result = convertToFeature(footPrint);
        expect(result).toEqual(footPrintFeature);
      });

      it('should throw an error for unsupported footPrint type', () => {
        const footPrint = {
          type: 'Point',
          coordinates: [],
        };

        const action = () => convertToFeature(footPrint as Footprint);

        expect(action).toThrow();
      });
    });
  });
});
