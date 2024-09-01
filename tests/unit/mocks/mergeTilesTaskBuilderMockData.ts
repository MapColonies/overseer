/* eslint-disable @typescript-eslint/no-magic-numbers */

import { Footprint } from '@map-colonies/mc-utils';
import { OverlapProcessingState } from '../../../src/common/interfaces';

export const testData: {
  description: string;
  input: {
    state: OverlapProcessingState;
    subGroupFootprints: Footprint[];
  };
}[] = [
  {
    description: 'No intersection found',
    input: {
      state: { currentIntersection: null, accumulatedOverlap: null },
      subGroupFootprints: [
        {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [0, 1],
              [1, 1],
              [1, 0],
              [0, 0],
            ],
          ],
        },
        {
          type: 'Polygon',
          coordinates: [
            [
              [2, 2],
              [2, 3],
              [3, 3],
              [3, 2],
              [2, 2],
            ],
          ],
        },
      ],
    },
  },
  {
    description: 'Intersection found, no accumulated overlap',
    input: {
      state: { currentIntersection: null, accumulatedOverlap: null },
      subGroupFootprints: [
        {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [0, 2],
              [2, 2],
              [2, 0],
              [0, 0],
            ],
          ],
        },

        {
          type: 'Polygon',
          coordinates: [
            [
              [1, 1],
              [1, 3],
              [3, 3],
              [3, 1],
              [1, 1],
            ],
          ],
        },
      ],
    },
  },
  {
    description: 'Intersection found, with accumulated overlap, new intersection',
    input: {
      state: {
        currentIntersection: null,
        accumulatedOverlap: {
          type: 'Polygon',
          coordinates: [
            [
              [1, 1],
              [1, 2],
              [2, 2],
              [2, 1],
              [1, 1],
            ],
          ],
        },
      },
      subGroupFootprints: [
        {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [0, 3],
              [3, 3],
              [3, 0],
              [0, 0],
            ],
          ],
        },
        {
          type: 'Polygon',
          coordinates: [
            [
              [2, 2],
              [2, 4],
              [4, 4],
              [4, 2],
              [2, 2],
            ],
          ],
        },
      ],
    },
  },
];
