import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { finished } from 'stream/promises'; // Promise-based stream completion
import crypto from 'crypto';
import path from 'path';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { context, trace, Tracer, SpanStatusCode } from '@opentelemetry/api';
import { SERVICES } from '../../common/constants';
import { FSError } from '../../common/errors';

@injectable()
export class FSService {
  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger, @inject(SERVICES.TRACER) private readonly tracer: Tracer) {}

  public async uploadJsonFile(filePath: string, data: Record<string, unknown>): Promise<void> {
    return context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${FSService.name}.${this.uploadJsonFile.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();
      try {
        activeSpan?.setAttributes({
          filePath,
          operation: 'uploadJsonFile',
        });

        this.logger.info({ msg: 'Uploading JSON file', filePath });

        // eslint-disable-next-line @typescript-eslint/no-magic-numbers
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));

        activeSpan?.addEvent('file.uploaded', { filePath });
        this.logger.info({ msg: 'JSON file uploaded successfully', filePath });
      } catch (err) {
        const error = new FSError(err, `Failed to upload JSON file ${filePath}`);

        this.logger.error({ msg: error.message, error });
        activeSpan?.recordException(error);
        activeSpan?.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });

        throw error;
      } finally {
        activeSpan?.end();
      }
    });
  }

  public async deleteFile(filePath: string): Promise<void> {
    return context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${FSService.name}.${this.deleteFile.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();
      try {
        activeSpan?.setAttributes({
          filePath,
          operation: 'deleteFile',
        });

        this.logger.info({ msg: 'Deleting file', filePath });
        await fs.unlink(filePath);

        activeSpan?.addEvent('file.deleted', { filePath });
        this.logger.info({ msg: 'File deleted successfully', filePath });
      } catch (err) {
        const error = new FSError(err, `Failed to delete file ${filePath}`);

        this.logger.error({ msg: error.message, error });
        activeSpan?.recordException(error);
        activeSpan?.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });

        throw error;
      } finally {
        activeSpan?.end();
      }
    });
  }

  public async deleteDirectory(dirPath: string, options: { force?: boolean } = { force: false }): Promise<boolean> {
    return context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${FSService.name}.${this.deleteDirectory.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();
      try {
        activeSpan?.setAttributes({
          dirPath,
          operation: 'deleteDirectory',
          force: options.force,
        });

        this.logger.info({ msg: 'Checking directory for deletion', dirPath, force: options.force });
        const dirContents = await fs.readdir(dirPath);
        activeSpan?.addEvent('directory.contents.read', { fileCount: dirContents.length });

        if (dirContents.length === 0) {
          // Directory is empty, safe to delete
          await fs.rmdir(dirPath);
          this.logger.info({ msg: 'Empty directory deleted successfully', dirPath });
          activeSpan?.addEvent('directory.deleted', { dirPath });
          return true;
        } else if (options.force === true) {
          // Directory has contents but force flag is true
          await fs.rm(dirPath, { recursive: true, force: true });
          this.logger.info({ msg: 'Directory and contents deleted successfully', dirPath, fileCount: dirContents.length });
          activeSpan?.addEvent('directory.force.deleted', { dirPath, fileCount: dirContents.length });
          return true;
        } else {
          // Directory has contents and force flag is false/undefined
          this.logger.info({ msg: 'Directory not empty, skipping deletion', dirPath, fileCount: dirContents.length });
          activeSpan?.addEvent('directory.not.empty', { fileCount: dirContents.length });
          return false;
        }
      } catch (err) {
        const error = new FSError(err, `Failed to delete directory ${dirPath}`);
        this.logger.error({ msg: error.message, error });
        activeSpan?.recordException(error);
        activeSpan?.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        throw error;
      } finally {
        activeSpan?.end();
      }
    });
  }

  public async getFileSize(filePath: string): Promise<number> {
    return context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${FSService.name}.${this.getFileSize.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();
      try {
        activeSpan?.setAttributes({
          filePath,
          operation: 'getFileSize',
        });

        this.logger.info({ msg: 'Getting file size', filePath });
        const stats = await fs.stat(filePath);

        activeSpan?.addEvent('file.size.read', { size: stats.size });
        this.logger.info({ msg: 'File size retrieved successfully', filePath, size: stats.size });

        return stats.size;
      } catch (err) {
        const error = new FSError(err, `Failed to get file size for ${filePath}`);

        this.logger.error({ msg: error.message, error });
        activeSpan?.recordException(error);
        activeSpan?.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });

        throw error;
      } finally {
        activeSpan?.end();
      }
    });
  }

  public async deleteFileAndParentDir(filePath: string): Promise<void> {
    return context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${FSService.name}.${this.deleteFileAndParentDir.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();
      try {
        activeSpan?.setAttributes({
          filePath,
          operation: 'deleteFileAndParentDir',
        });

        this.logger.info({ msg: 'Deleting file parent directory', filePath });

        await this.deleteFile(filePath);
        activeSpan?.addEvent('file.deleted');

        const dirPath = path.dirname(filePath);
        const deleted = await this.deleteDirectory(dirPath, { force: false });

        activeSpan?.addEvent('directory.processed', { dirPath, deleted });
      } catch (err) {
        const error = err instanceof FSError ? err : new FSError(err, `Failed to delete file and parent directory for ${filePath}`);

        this.logger.error({ msg: error.message, error });
        activeSpan?.recordException(error);
        activeSpan?.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });

        throw error;
      } finally {
        activeSpan?.end();
      }
    });
  }

  public async calculateFileSha256(filePath: string): Promise<string> {
    return context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${FSService.name}.${this.calculateFileSha256.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();
      try {
        activeSpan?.setAttributes({
          filePath,
          operation: 'calculateFileSha256',
        });

        this.logger.info({ msg: 'Calculating file SHA256', filePath });
        await fs.access(filePath);

        const hash = crypto.createHash('sha256');
        const fileStream = createReadStream(filePath);

        fileStream.on('data', (data) => {
          hash.update(data);
        });

        await finished(fileStream);

        const sha256 = hash.digest('hex');

        activeSpan?.addEvent('file.sha256.calculated', { sha256 });
        this.logger.info({ msg: 'SHA256 calculated successfully', filePath, sha256 });
        return sha256;
      } catch (err) {
        const error = new FSError(err, `Failed to calculate SHA256 for ${filePath}`);
        this.logger.error({ msg: error.message, error });
        activeSpan?.recordException(error);
        activeSpan?.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        throw error;
      } finally {
        activeSpan?.end();
      }
    });
  }
}
