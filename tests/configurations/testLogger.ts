import { pino } from 'pino';
import type { Logger } from '@map-colonies/js-logger';

export const getTestLogger = (): Logger => pino({ enabled: false });
