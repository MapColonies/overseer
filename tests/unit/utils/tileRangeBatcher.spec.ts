import type { ITileRange } from '@map-colonies/mc-utils';
import { limitedTileBatchGenerator } from '../../../src/utils/tileRangeBatcher';

/** One-tile range at z21, distinguishable by x so we can assert nothing is dropped. */
const singleTile = (x: number): ITileRange => ({ zoom: 21, minX: x, maxX: x, minY: 0, maxY: 0 });

function* ranges(...items: ITileRange[]): Generator<ITileRange> {
  yield* items;
}

const collect = async (source: AsyncGenerator<ITileRange[]>): Promise<ITileRange[][]> => {
  const batches: ITileRange[][] = [];
  for await (const batch of source) {
    batches.push(batch);
  }
  return batches;
};

describe('cappedTileBatchGenerator', () => {
  it('should yield a single batch when the ranges fit both limits', async () => {
    const batches = await collect(limitedTileBatchGenerator(100, 100, ranges(singleTile(0))));

    expect(batches).toEqual([[singleTile(0)]]);
  });

  it('should split a batch that exceeds maxRangesPerTask, preserving every range in order', async () => {
    const input = Array.from({ length: 10 }, (_, index) => singleTile(index));
    // `tileBatchGenerator` walks `range.minY` forward in place, so `input` is mutated as it is
    // consumed while the yielded ranges are fresh objects. Build the expectation separately -
    // asserting against `input` after the fact compares against the mutated originals and fails.
    const expected = Array.from({ length: 10 }, (_, index) => singleTile(index));

    // 10 tiles is well under the 1000-tile budget, so tileBatchGenerator produces one batch of
    // 10 ranges; only the range cap splits it.
    const batches = await collect(limitedTileBatchGenerator(1000, 4, ranges(...input)));

    expect(batches.map((batch) => batch.length)).toEqual([4, 4, 2]);
    expect(batches.flat()).toEqual(expected);
  });

  it('should still split by tile count when the range cap is not reached', async () => {
    // one 10-wide row, cut into 4 + 4 + 2 tiles by the tile budget
    const batches = await collect(limitedTileBatchGenerator(4, 100, ranges({ zoom: 21, minX: 0, maxX: 9, minY: 0, maxY: 0 })));

    expect(batches).toEqual([
      [{ zoom: 21, minX: 0, maxX: 3, minY: 0, maxY: 0 }],
      [{ zoom: 21, minX: 4, maxX: 7, minY: 0, maxY: 0 }],
      [{ zoom: 21, minX: 8, maxX: 9, minY: 0, maxY: 0 }],
    ]);
  });

  it('should yield nothing for an empty range generator', async () => {
    const batches = await collect(limitedTileBatchGenerator(100, 100, ranges()));

    expect(batches).toEqual([]);
  });

  it('should reject a maxRangesPerTask below 1, which would loop forever', async () => {
    const action = collect(limitedTileBatchGenerator(100, 0, ranges(singleTile(0))));

    await expect(action).rejects.toThrow(RangeError);
  });
});
