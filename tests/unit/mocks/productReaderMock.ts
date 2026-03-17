import { ChunkProcessor, ShapefileChunk, ShapefileChunkReader } from '@map-colonies/shapefile-reader';

export const readProductGeometryMock = jest.fn();

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const mockShapefileReader = (chunk: ShapefileChunk) => {
  const mockReadAndProcess = jest.fn(async (_path: string, processor: ChunkProcessor) => {
    await processor.process(chunk);
  });

  (ShapefileChunkReader as jest.Mock).mockImplementation(() => ({
    readAndProcess: mockReadAndProcess,
  }));

  return mockReadAndProcess;
};
