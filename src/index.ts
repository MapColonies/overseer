import 'reflect-metadata';

import { createServer } from 'http';
import { createTerminus } from '@godaddy/terminus';
import { Logger } from '@map-colonies/js-logger';
import config from 'config';
import { DEFAULT_SERVER_PORT, SERVICES } from './common/constants';
import { getApp } from './app';
import { PollingWorker } from './pollingWorker';

const port: number = config.get<number>('server.port') || DEFAULT_SERVER_PORT;
const [app, container] = getApp();
const logger = container.resolve<Logger>(SERVICES.LOGGER);
const pollingWorker = container.resolve(PollingWorker);

const stubHealthCheck = async (): Promise<void> => Promise.resolve();

const server = createTerminus(createServer(app), {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  healthChecks: { '/liveness': stubHealthCheck },
  onSignal: container.resolve('onSignal'),
});

server.listen(port, () => {
  logger.info(`app started on port ${port}`);
  pollingWorker.start();
});
