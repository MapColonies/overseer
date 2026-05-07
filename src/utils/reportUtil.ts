import { execFile } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { Logger } from '@map-colonies/js-logger';
import { ShapefileChunkReader, type ChunkProcessor, type ShapefileChunk } from '@map-colonies/shapefile-reader';
import type { Feature } from 'geojson';
import { StorageProvider } from '../common/constants';
import { S3Service } from './storage/s3Service';

export async function readConflictFeatures(
  reportPath: string,
  reportProvider: StorageProvider,
  s3Service: S3Service,
  shapefileReader: ShapefileChunkReader,
  logger: Logger
): Promise<Feature[]> {
  const conflictFeatures: Feature[] = [];

  logger.info({ msg: 'Extracting ZIP report to read conflict shapefile', reportPath, reportProvider });

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'conflict-report-'));

  try {
    let zipPath: string;

    if (reportProvider === StorageProvider.S3) {
      const tempZipPath = path.join(tempDir, 'report.zip');
      logger.info({ msg: 'Downloading ZIP report from S3', s3Key: reportPath });
      await s3Service.downloadFile(reportPath, tempZipPath);
      zipPath = tempZipPath;
    } else {
      zipPath = `/${reportPath}`;
    }

    await new Promise<void>((resolve, reject) => {
      execFile('unzip', ['-o', zipPath, '-d', tempDir], (error) => {
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
      throw new Error(`No shapefile found in ZIP report: ${zipPath}`);
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
