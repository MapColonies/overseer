/* eslint-disable @typescript-eslint/naming-convention */
import * as fs from 'fs';
import { inject, injectable } from 'tsyringe';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Logger } from '@map-colonies/js-logger';
import { context, trace, Tracer, SpanStatusCode } from '@opentelemetry/api';
import { SERVICES } from '../../common/constants';
import { IS3Config } from '../../common/interfaces';

@injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly s3Config: IS3Config;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.S3CONFIG) s3Config: IS3Config,
    @inject(SERVICES.TRACER) private readonly tracer: Tracer
  ) {
    this.s3Config = s3Config;
    const { accessKeyId, secretAccessKey, endpointUrl } = this.s3Config;
    this.client = new S3Client({
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      endpoint: endpointUrl,
      region: 'us-east-1', //For MinIo the region has no significance but it is required for the S3Client
    });
  }

  public async uploadFile(filePath: string, s3Key: string, contentType?: string): Promise<string> {
    return context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${S3Service.name}.${this.uploadFile.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();
      try {
        const { bucket, endpointUrl } = this.s3Config;

        activeSpan?.setAttributes({
          endpointUrl,
          bucket,
          s3Key,
          filePath,
          contentType: contentType ?? 'unknown',
        });

        const fileContent = fs.readFileSync(filePath);
        activeSpan?.addEvent('file.read', { filePath });

        const command = new PutObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          ContentType: contentType,
          Body: fileContent,
        });

        await this.client.send(command);
        activeSpan?.addEvent('s3.upload.complete');

        const url = `${endpointUrl}/${bucket}/${s3Key}`;
        this.logger.info({ msg: 'File uploaded to S3', url });
        activeSpan?.setAttributes({ s3Url: url });

        return url;
      } catch (err) {
        this.logger.error({ msg: 'Error uploading file to S3', err });
        if (err instanceof Error) {
          activeSpan?.recordException(err);
          activeSpan?.setStatus({
            code: SpanStatusCode.ERROR,
            message: err.message,
          });
        }
        throw err;
      } finally {
        activeSpan?.end();
      }
    });
  }
}
