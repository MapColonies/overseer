import { TileOutputFormat, Transparency } from '@map-colonies/raster-shared';
import { UnsupportedTransparencyError } from '../common/errors';

export const getTileOutputFormat = (transparency: Transparency): TileOutputFormat => {
  switch (transparency) {
    case Transparency.OPAQUE:
      return TileOutputFormat.JPEG;
    case Transparency.TRANSPARENT:
      return TileOutputFormat.PNG;
    default:
      throw new UnsupportedTransparencyError(transparency);
  }
};
