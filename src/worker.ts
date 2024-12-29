import 'reflect-metadata';
import { parentPort } from 'worker_threads';
import { JobProcessor } from './job/models/jobProcessor';
import { getApp } from './app';
import { messageTypes } from './pollingWorker';

// Initialize container in worker thread
const [, workerContainer] = getApp();
const jobProcessor = workerContainer.resolve(JobProcessor);

async function startPolling(): Promise<void> {
  try {
    await jobProcessor.start();
  } catch (error) {
    if (error instanceof Error) {
      parentPort?.postMessage({ type: messageTypes.ERROR, error: error.message });
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-misused-promises
parentPort?.on('message', async (message: { type: string }) => {
  switch (message.type) {
    case messageTypes.START:
      await startPolling();
      break;
    case messageTypes.STOP:
      jobProcessor.stop();
      break;
  }
});
