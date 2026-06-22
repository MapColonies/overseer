import type { MockInstance } from 'vitest';
import type { ChunkProcessor, ShapefileChunk } from '@map-colonies/shapefile-reader';
import { ShapefileChunkReader } from '@map-colonies/shapefile-reader';

export const readProductGeometryMock = vi.fn();

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const mockShapefileReader = (chunk: ShapefileChunk) => {
  const mockReadAndProcess = vi.fn(async (_path: string, processor: ChunkProcessor) => {
    await processor.process(chunk);
  });

  (ShapefileChunkReader as unknown as MockInstance).mockImplementation(() => ({
    readAndProcess: mockReadAndProcess,
  }));

  return mockReadAndProcess;
};
