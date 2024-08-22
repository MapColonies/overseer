import { randomUUID } from 'crypto';
import { TileOutputFormat } from '@map-colonies/mc-model-types';
import { MergeTilesTaskParams } from '../../../src/common/interfaces';
import { partData } from './jobsMockData';

const mergeTilesTaskParameters: MergeTilesTaskParams = {
  taskMetadata: { layerRelativePath: `${randomUUID()}/${randomUUID()}`, tileOutputFormat: TileOutputFormat.PNG },
  partData,
  inputFiles: {
    originDirectory: 'tests',
    fileNames: ['blueMarble.gpkg'],
  },
};
