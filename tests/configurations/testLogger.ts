import { jsLogger, type Logger } from '@map-colonies/js-logger';

// eslint-disable-next-line @typescript-eslint/return-await
export const getTestLogger = async (): Promise<Logger> => await jsLogger({ enabled: false });
