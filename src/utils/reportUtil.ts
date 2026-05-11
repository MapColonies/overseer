import { execFile } from 'child_process';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import type { ReadableStream as WebReadableStream } from 'stream/web';
import os from 'os';
import path from 'path';
import type { Logger } from '@map-colonies/js-logger';
import { ShapefileChunkReader, type ChunkProcessor, type ShapefileChunk } from '@map-colonies/shapefile-reader';
import type { Feature } from 'geojson';

export async function readConflictFeatures(
  reportUrl: string,
  shapefileReader: ShapefileChunkReader,
  logger: Logger
): Promise<Feature[]> {
  const conflictFeatures: Feature[] = [];

  logger.info({ msg: 'Downloading ZIP report to read conflict shapefile', reportUrl });

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'conflict-report-'));

  try {
    const tempZipPath = path.join(tempDir, 'report.zip');

    const response = await fetch(reportUrl);
    if (!response.ok || response.body === null) {
      throw new Error(`Failed to download report from URL: ${reportUrl} (status ${response.status})`);
    }
    await pipeline(Readable.fromWeb(response.body as WebReadableStream), createWriteStream(tempZipPath));

    await new Promise<void>((resolve, reject) => {
      execFile('unzip', ['-o', tempZipPath, '-d', tempDir], (error) => {
        if (error !== null) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    const entries = await fs.readdir(tempDir, { recursive: true });
    const shpEntry = entries.find((entry) => entry.toString().endsWith('.shp'));

    if (shpEntry === undefined) {
      throw new Error(`No shapefile found in ZIP report downloaded from: ${reportUrl}`);
    }

    const shpPath = path.join(tempDir, shpEntry.toString());

    logger.info({ msg: 'Reading conflict features from shapefile', shpPath });

    const processor: ChunkProcessor = {
      // eslint-disable-next-line @typescript-eslint/require-await
      process: async (chunk: ShapefileChunk): Promise<void> => {
        conflictFeatures.push(...chunk.features);
      },
    };

    await shapefileReader.readAndProcess(shpPath, processor);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  return conflictFeatures;
}
