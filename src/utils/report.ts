import { execFile } from 'child_process';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import { Writable } from 'stream';
import os from 'os';
import path from 'path';
import type { Logger } from '@map-colonies/js-logger';
import { ShapefileChunkReader, type ChunkProcessor, type ShapefileChunk } from '@map-colonies/shapefile-reader';
import type { Feature } from 'geojson';

async function downloadZip(reportUrl: string, destPath: string, logger: Logger): Promise<void> {
  logger.info({ msg: 'Downloading ZIP report to read conflict shapefile', reportUrl });
  const response = await fetch(reportUrl);
  if (!response.ok || response.body === null) {
    throw new Error(`Failed to download report from URL: ${reportUrl} (status ${response.status})`);
  }
  await response.body.pipeTo(Writable.toWeb(createWriteStream(destPath)));
}

async function processZip(tempZipPath: string, tempDir: string, shapefileReader: ShapefileChunkReader, logger: Logger): Promise<Feature[]> {
  const conflictFeatures: Feature[] = [];

  await new Promise<void>((resolve, reject) => {
    execFile('unzip', ['-o', tempZipPath, '-d', tempDir], (error) => {
      if (error !== null) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

  const directoryContent = await fs.readdir(tempDir, { recursive: true });
  const shpEntry = directoryContent.find((entry) => entry.toString().endsWith('.shp'));

  if (shpEntry === undefined) {
    throw new Error(`No shapefile found in ZIP report downloaded from: ${tempZipPath}`);
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

  return conflictFeatures;
}

export async function readConflictFeatures(reportUrl: string, shapefileReader: ShapefileChunkReader, logger: Logger): Promise<Feature[]> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'conflict-report-')); //mkdtemp concats suffix of 6 random characters to ensure uniqueness

  try {
    const tempZipPath = path.join(tempDir, 'report.zip');
    await downloadZip(reportUrl, tempZipPath, logger);
    return await processZip(tempZipPath, tempDir, shapefileReader, logger);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
