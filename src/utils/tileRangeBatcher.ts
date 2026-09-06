import { tileBatchGenerator } from '@map-colonies/mc-utils';
import type { ITileRange } from '@map-colonies/mc-utils';

/** Adapts a sync generator to the async generator `tileBatchGenerator` expects. */
// eslint-disable-next-line @typescript-eslint/require-await -- a pass-through async generator has nothing to await
async function* toAsyncGenerator<T>(source: Generator<T>): AsyncGenerator<T> {
  for (const item of source) {
    yield item;
  }
}

/**
 * Batches tile ranges bounded by tile count and range count per batch.
 *
 * Caps both tile count (via `tileBatchGenerator`) and ITileRange count, since complex
 * footprints can yield thousands of ranges that exceed task params size limits.
 *
 * @param tileBatchSize maximum tiles per batch
 * @param maxRangesPerTask maximum ITileRange objects per batch
 * @param ranges sync generator of ranges, e.g. from `footprintToTileRanges`
 */
export async function* limitedTileBatchGenerator(
  tileBatchSize: number,
  maxRangesPerTask: number,
  ranges: Generator<ITileRange>
): AsyncGenerator<ITileRange[]> {
  if (tileBatchSize < 1 || maxRangesPerTask < 1) {
    throw new RangeError(`tileBatchSize [${tileBatchSize}] and maxRangesPerTask [${maxRangesPerTask}] must both be at least 1`);
  }

  for await (const batch of tileBatchGenerator(tileBatchSize, toAsyncGenerator(ranges))) {
    // slicing preserves every range and their order; it only spreads them over more tasks
    for (let index = 0; index < batch.length; index += maxRangesPerTask) {
      yield batch.slice(index, index + maxRangesPerTask);
    }
  }
}
