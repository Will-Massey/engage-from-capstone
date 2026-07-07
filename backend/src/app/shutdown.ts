import type { Server } from 'http';
import { captureException, Sentry } from '../config/sentry.js';
import logger from '../utils/logger.js';
import { cache } from '../utils/cache.js';
import { prisma } from '../config/database.js';

/** Max time to wait for in-flight requests before forcing shutdown. */
export const DRAIN_TIMEOUT_MS = 10_000;

/**
 * Stop accepting new connections and wait for in-flight requests to finish,
 * up to `timeoutMs`. Resolves either way — shutdown must never hang.
 */
export function drainServer(
  server: Pick<Server, 'close'>,
  timeoutMs: number = DRAIN_TIMEOUT_MS
): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = (timedOut: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (timedOut) {
        logger.warn(`HTTP server did not drain within ${timeoutMs}ms, forcing shutdown`);
      }
      resolve();
    };
    const timer = setTimeout(() => finish(true), timeoutMs);
    timer.unref?.();
    server.close(() => finish(false));
  });
}

export function registerProcessHandlers(server?: Server): void {
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

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    if (server) {
      await drainServer(server);
    }
    await prisma.$disconnect().catch(() => {});
    await cache.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}
