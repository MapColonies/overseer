import { Worker } from 'worker_threads';
import { join } from 'path';
import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from './common/constants';

/* eslint-disable @typescript-eslint/naming-convention */
export const messageTypes = {
  START: 'START',
  STOP: 'STOP',
  ERROR: 'ERROR',
} as const;
/* eslint-enable @typescript-eslint/naming-convention */

@injectable()
export class PollingWorker {
  private worker!: Worker;

  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger) {
    this.initializeWorker();
  }

  public start(): void {
    this.worker.postMessage({ type: messageTypes.START });
  }

  private stop(): void {
    this.worker.postMessage({ type: messageTypes.STOP });
  }

  private initializeWorker(): void {
    this.worker = new Worker(join(__dirname, 'worker.js'));

    this.worker.on('message', (message: { type: string; error?: string }) => {
      if (message.type === messageTypes.ERROR) {
        this.logger.fatal('Polling error', { error: message.error });
        this.stop();
      }
    });

    this.worker.on('error', (error) => {
      this.logger.error('Worker error', { error });
    });

    this.worker.on('exit', (code) => {
      this.logger.warn('Worker exited with code', { code });
    });
  }
}
