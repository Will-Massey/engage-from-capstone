import { captureException, Sentry } from '../config/sentry.js';
import logger from '../utils/logger.js';
import { cache } from '../utils/cache.js';

export function registerProcessHandlers(): void {
  // Background jobs run via setInterval and never reach the Express error
  // handler, so their failures would otherwise be invisible. Capture them.
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logger.error('Unhandled promise rejection', { error: err.message, stack: err.stack });
    captureException(err, { kind: 'unhandledRejection' });
  });

  process.on('uncaughtException', async (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    captureException(err, { kind: 'uncaughtException' });
    await Sentry.flush(2000).catch(() => {});
    process.exit(1); // preserve crash semantics; Render restarts the instance
  });

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await cache.disconnect();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    await cache.disconnect();
    process.exit(0);
  });
}
