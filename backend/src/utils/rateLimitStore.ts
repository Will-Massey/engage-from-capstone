import { RedisStore } from 'rate-limit-redis';
import { createClient, type RedisClientType } from 'redis';
import type { Store } from 'express-rate-limit';
import logger from '../config/logger.js';

/**
 * Shared rate-limit store factory. When REDIS_URL is set, limits are enforced
 * in Redis so they hold across multiple backend instances. Without Redis this
 * returns undefined and express-rate-limit falls back to its per-instance
 * MemoryStore (correct for a single instance). Provision Redis + set REDIS_URL
 * to make rate limiting cluster-wide.
 *
 * express-rate-limit requires a DISTINCT Store instance per limiter, so this is
 * a factory: call it once per limiter. The Redis client is shared; only the
 * store wrapper (and its key prefix) is unique per call.
 */
let client: RedisClientType | undefined;
let prefixCounter = 0;

const REDIS_URL = process.env.REDIS_URL;
if (REDIS_URL) {
  try {
    // disableOfflineQueue: when Redis is down, commands must REJECT immediately
    // rather than queue awaiting a reconnect — a queued increment left every
    // rate-limited request hanging forever (prod outage 2026-07-06). Combined
    // with passOnStoreError on the limiters, a dead Redis degrades to
    // fail-open rate limiting instead of taking the API down.
    client = createClient({ url: REDIS_URL, disableOfflineQueue: true });
    client.on('error', (err) => logger.error('rate-limit Redis error:', err));
    client.connect().catch((err) => logger.error('rate-limit Redis connect failed:', err));
    logger.info('Rate limiting backed by Redis (cluster-wide).');
  } catch (err) {
    logger.error('Failed to init Redis rate-limit store; using in-memory:', err);
    client = undefined;
  }
}

export function rateLimitStore(): Store | undefined {
  // Limiters are created at module import; if Redis is still connecting (or
  // offline after a prior jest suite), fall back to per-process MemoryStore.
  if (!client?.isReady) return undefined;
  prefixCounter += 1;
  return new RedisStore({
    // node-redis v4 takes a variadic command; rate-limit-redis passes an array.
    // Fail open when Redis is offline (matches passOnStoreError on limiters) so
    // jest smoke teardown does not mark the suite failed after tests pass.
    sendCommand: async (...args: string[]) => {
      try {
        return (await client!.sendCommand(args)) as never;
      } catch (err) {
        logger.error('rate-limit Redis sendCommand error:', err);
        return undefined as never;
      }
    },
    prefix: `rl:${prefixCounter}:`,
  });
}
