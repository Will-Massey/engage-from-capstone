const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const memoryAttempts = new Map<string, { count: number; resetAt: number }>();
const memoryLocks = new Map<string, number>();

function key(email: string, tenantId: string): string {
  return `${email.toLowerCase()}:${tenantId}`;
}

function redisEnabled(): boolean {
  return Boolean(process.env.REDIS_URL);
}

async function redisGet(keyName: string): Promise<string | null> {
  if (!redisEnabled()) return null;
  try {
    const { default: redis } = await import('../config/redis.js');
    return await redis.get(keyName);
  } catch {
    return null;
  }
}

async function redisSet(keyName: string, value: string, ttlSeconds: number): Promise<void> {
  if (!redisEnabled()) return;
  try {
    const { default: redis } = await import('../config/redis.js');
    await redis.setex(keyName, ttlSeconds, value);
  } catch {
    // memory fallback only
  }
}

async function redisDel(keyName: string): Promise<void> {
  if (!redisEnabled()) return;
  try {
    const { default: redis } = await import('../config/redis.js');
    await redis.del(keyName);
  } catch {
    // ignore
  }
}

export async function isLoginLocked(email: string, tenantId: string): Promise<boolean> {
  const k = key(email, tenantId);
  const lockKey = `login:lock:${k}`;
  const redisLock = await redisGet(lockKey);
  if (redisLock) return true;

  const memLock = memoryLocks.get(k);
  if (memLock && memLock > Date.now()) return true;
  if (memLock) memoryLocks.delete(k);
  return false;
}

export async function recordFailedLogin(email: string, tenantId: string): Promise<number> {
  const k = key(email, tenantId);
  const attemptKey = `login:attempts:${k}`;
  const lockKey = `login:lock:${k}`;

  const redisCount = await redisGet(attemptKey);
  let count = redisCount ? parseInt(redisCount, 10) + 1 : 1;

  if (!redisCount) {
    const mem = memoryAttempts.get(k);
    if (mem && mem.resetAt > Date.now()) {
      count = mem.count + 1;
    } else {
      count = 1;
    }
    memoryAttempts.set(k, { count, resetAt: Date.now() + ATTEMPT_WINDOW_MS });
  } else {
    await redisSet(attemptKey, String(count), Math.ceil(ATTEMPT_WINDOW_MS / 1000));
  }

  if (count >= MAX_ATTEMPTS) {
    await redisSet(lockKey, '1', Math.ceil(LOCKOUT_MS / 1000));
    memoryLocks.set(k, Date.now() + LOCKOUT_MS);
    memoryAttempts.delete(k);
    await redisDel(attemptKey);
  }

  return count;
}

export async function clearLoginAttempts(email: string, tenantId: string): Promise<void> {
  const k = key(email, tenantId);
  await redisDel(`login:attempts:${k}`);
  await redisDel(`login:lock:${k}`);
  memoryAttempts.delete(k);
  memoryLocks.delete(k);
}

export const LOGIN_LOCKOUT_MAX = MAX_ATTEMPTS;
