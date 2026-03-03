import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(redisUrl, {
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redis.on('connect', () => {
  console.log('Redis connected successfully');
});

// Tenant-aware cache operations
export class TenantCache {
  private prefix: string;

  constructor(tenantId: string) {
    this.prefix = `tenant:${tenantId}`;
  }

  private key(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async get(key: string): Promise<string | null> {
    return redis.get(this.key(key));
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const fullKey = this.key(key);
    if (ttlSeconds) {
      await redis.setex(fullKey, ttlSeconds, value);
    } else {
      await redis.set(fullKey, value);
    }
  }

  async delete(key: string): Promise<void> {
    await redis.del(this.key(key));
  }

  async getJSON<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    return value ? JSON.parse(value) : null;
  }

  async setJSON<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  // Session management
  async createSession(sessionId: string, userId: string, ttlSeconds: number = 86400): Promise<void> {
    await this.set(`session:${sessionId}`, userId, ttlSeconds);
  }

  async getSession(sessionId: string): Promise<string | null> {
    return this.get(`session:${sessionId}`);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.delete(`session:${sessionId}`);
  }

  // Rate limiting
  async incrementCounter(key: string, windowSeconds: number): Promise<number> {
    const fullKey = this.key(`ratelimit:${key}`);
    const multi = redis.multi();
    multi.incr(fullKey);
    multi.expire(fullKey, windowSeconds);
    const results = await multi.exec();
    return (results?.[0]?.[1] as number) || 0;
  }
}

export default redis;
