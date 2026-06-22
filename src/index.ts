// this import must be called before the first import of tsyringe
import 'reflect-metadata';
import { createServer } from 'node:http';
import { createTerminus } from '@godaddy/terminus';
import type { Logger } from '@map-colonies/js-logger';
import { SERVICES } from './common/constants';
import { getConfig } from './common/config';
import { getApp } from './app';
import { JobProcessor } from './job/models/jobProcessor';

void getApp()
  .then(([app, container]) => {
    const logger = container.resolve<Logger>(SERVICES.LOGGER);
    const config = getConfig();
    const port = config.get('server.port');
    const stubHealthCheck = async (): Promise<void> => Promise.resolve();

    const server = createTerminus(createServer(app), {
      healthChecks: { '/liveness': stubHealthCheck },
      onSignal: container.resolve('onSignal'),
    });

    const jobProcessor = container.resolve(JobProcessor);

    server.listen(port, () => {
      logger.info(`app started on port ${port}`);
      void jobProcessor.start().catch((err: Error) => {
        logger.fatal({ msg: 'error in main loop', err });
        jobProcessor.stop();
        process.exit(1);
      });
    });
  })
  .catch((error: Error) => {
    console.error('😢 - failed initializing the server');
    console.error(error);
    process.exit(1);
  });
