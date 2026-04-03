"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantCache = exports.redis = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
exports.redis = new ioredis_1.default(redisUrl, {
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    maxRetriesPerRequest: 3,
});
exports.redis.on('error', (err) => {
    console.error('Redis connection error:', err);
});
exports.redis.on('connect', () => {
    console.log('Redis connected successfully');
});
// Tenant-aware cache operations
class TenantCache {
    constructor(tenantId) {
        this.prefix = `tenant:${tenantId}`;
    }
    key(key) {
        return `${this.prefix}:${key}`;
    }
    async get(key) {
        return exports.redis.get(this.key(key));
    }
    async set(key, value, ttlSeconds) {
        const fullKey = this.key(key);
        if (ttlSeconds) {
            await exports.redis.setex(fullKey, ttlSeconds, value);
        }
        else {
            await exports.redis.set(fullKey, value);
        }
    }
    async delete(key) {
        await exports.redis.del(this.key(key));
    }
    async getJSON(key) {
        const value = await this.get(key);
        return value ? JSON.parse(value) : null;
    }
    async setJSON(key, value, ttlSeconds) {
        await this.set(key, JSON.stringify(value), ttlSeconds);
    }
    // Session management
    async createSession(sessionId, userId, ttlSeconds = 86400) {
        await this.set(`session:${sessionId}`, userId, ttlSeconds);
    }
    async getSession(sessionId) {
        return this.get(`session:${sessionId}`);
    }
    async deleteSession(sessionId) {
        await this.delete(`session:${sessionId}`);
    }
    // Rate limiting
    async incrementCounter(key, windowSeconds) {
        const fullKey = this.key(`ratelimit:${key}`);
        const multi = exports.redis.multi();
        multi.incr(fullKey);
        multi.expire(fullKey, windowSeconds);
        const results = await multi.exec();
        return results?.[0]?.[1] || 0;
    }
}
exports.TenantCache = TenantCache;
exports.default = exports.redis;
//# sourceMappingURL=redis.js.map