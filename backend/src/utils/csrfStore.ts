/**
 * CSRF token registry — Redis-backed with in-memory fallback for cross-domain deployments.
 */

const TTL_MS = 24 * 60 * 60 * 1000;
const TTL_SECONDS = Math.ceil(TTL_MS / 1000);
const REDIS_PREFIX = 'csrf:';

const memoryTokens = new Map<string, number>();

function useRedis(): boolean {
  return process.env.REDIS_URL !== undefined && process.env.CSRF_REDIS !== 'false';
}

async function redisOp<T>(fn: (client: typeof import('../config/redis.js').default) => Promise<T>): Promise<T | null> {
  if (!useRedis()) return null;
  try {
    const { default: redis } = await import('../config/redis.js');
    return await fn(redis);
  } catch {
    return null;
  }
}

export function registerCsrfToken(token: string): void {
  const expires = Date.now() + TTL_MS;
  memoryTokens.set(token, expires);

  if (useRedis()) {
    void redisOp((redis) => redis.setex(`${REDIS_PREFIX}${token}`, TTL_SECONDS, '1'));
  }
}

export function isCsrfTokenRegistered(token: string): boolean {
  const memExpires = memoryTokens.get(token);
  if (memExpires) {
    if (memExpires < Date.now()) {
      memoryTokens.delete(token);
    } else {
      return true;
    }
  }
  return false;
}

/** Async check including Redis (for cross-instance validation). */
export async function isCsrfTokenRegisteredAsync(token: string): Promise<boolean> {
  if (isCsrfTokenRegistered(token)) return true;

  const hit = await redisOp((redis) => redis.get(`${REDIS_PREFIX}${token}`));
  if (hit) {
    memoryTokens.set(token, Date.now() + TTL_MS);
    return true;
  }
  return false;
}

export function revokeCsrfToken(token: string): void {
  memoryTokens.delete(token);
  if (useRedis()) {
    void redisOp((redis) => redis.del(`${REDIS_PREFIX}${token}`).then(() => 1));
  }
}
