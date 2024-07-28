// this import must be called before the first import of tsyringe
import 'reflect-metadata';
import { createServer } from 'http';
import { createTerminus } from '@godaddy/terminus';
import { Logger } from '@map-colonies/js-logger';
import config from 'config';
import { DEFAULT_SERVER_PORT, SERVICES } from './common/constants';
import { getApp } from './app';
import { JobProcessor } from './models/jobProcessor';

const port: number = config.get<number>('server.port') || DEFAULT_SERVER_PORT;

const [app, container] = getApp();

const logger = container.resolve<Logger>(SERVICES.LOGGER);
const stubHealthCheck = async (): Promise<void> => Promise.resolve();
// eslint-disable-next-line @typescript-eslint/naming-convention
const server = createTerminus(createServer(app), { healthChecks: { '/liveness': stubHealthCheck, onSignal: container.resolve('onSignal') } });

const jobProcessor = container.resolve(JobProcessor);

async function startPolling(): Promise<void> {
  await jobProcessor.start();
}

server.listen(port, () => {
  logger.info(`app started on port ${port}`);
  startPolling().catch((error) => {
    if (error instanceof Error) {
      logger.error({ msg: 'error in main loop', error: error.message });
    }
    jobProcessor.stop();
    process.exit(1);
  });
});
