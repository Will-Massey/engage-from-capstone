"use strict";
/**
 * =============================================================================
 * Redis Cache Utility
 * =============================================================================
 * High-performance caching layer with:
 * - Connection pooling
 * - Automatic serialization
 * - TTL management
 * - Cache warming
 * - Circuit breaker pattern
 * =============================================================================
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheKeys = exports.cache = void 0;
exports.cached = cached;
const redis_1 = require("redis");
const logger_1 = __importDefault(require("./logger"));
// =============================================================================
// Configuration
// =============================================================================
const REDIS_URL = process.env.REDIS_URL;
const DEFAULT_TTL = 3600; // 1 hour in seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second
// =============================================================================
// Cache Client
// =============================================================================
class CacheClient {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.retryCount = 0;
        this.circuitOpen = false;
        this.circuitResetTimeout = null;
        if (!REDIS_URL) {
            logger_1.default.warn('Redis URL not configured, caching disabled');
            return;
        }
        this.client = (0, redis_1.createClient)({
            url: REDIS_URL,
            socket: {
                reconnectStrategy: (retries) => {
                    if (retries > MAX_RETRIES) {
                        logger_1.default.error('Max Redis reconnection attempts reached');
                        this.openCircuit();
                        return false;
                    }
                    return RETRY_DELAY;
                },
            },
        });
        this.setupEventHandlers();
    }
    setupEventHandlers() {
        if (!this.client)
            return;
        this.client.on('connect', () => {
            logger_1.default.info('Redis client connected');
            this.isConnected = true;
            this.retryCount = 0;
            this.closeCircuit();
        });
        this.client.on('error', (err) => {
            logger_1.default.error('Redis client error:', err);
            this.isConnected = false;
        });
        this.client.on('disconnect', () => {
            logger_1.default.warn('Redis client disconnected');
            this.isConnected = false;
        });
    }
    openCircuit() {
        this.circuitOpen = true;
        logger_1.default.warn('Cache circuit breaker opened');
        // Reset circuit after 30 seconds
        this.circuitResetTimeout = setTimeout(() => {
            this.closeCircuit();
        }, 30000);
    }
    closeCircuit() {
        this.circuitOpen = false;
        if (this.circuitResetTimeout) {
            clearTimeout(this.circuitResetTimeout);
            this.circuitResetTimeout = null;
        }
        logger_1.default.info('Cache circuit breaker closed');
    }
    async connect() {
        if (!this.client || this.isConnected)
            return;
        try {
            await this.client.connect();
        }
        catch (error) {
            logger_1.default.error('Failed to connect to Redis:', error);
            throw error;
        }
    }
    async disconnect() {
        if (!this.client || !this.isConnected)
            return;
        try {
            await this.client.disconnect();
            this.isConnected = false;
        }
        catch (error) {
            logger_1.default.error('Error disconnecting from Redis:', error);
        }
    }
    // =============================================================================
    // Cache Operations
    // =============================================================================
    async get(key) {
        if (!this.isAvailable())
            return null;
        try {
            const value = await this.client.get(key);
            if (!value)
                return null;
            return JSON.parse(value);
        }
        catch (error) {
            logger_1.default.error('Cache get error:', { key, error });
            return null;
        }
    }
    async set(key, value, ttl = DEFAULT_TTL) {
        if (!this.isAvailable())
            return;
        try {
            const serialized = JSON.stringify(value);
            await this.client.setEx(key, ttl, serialized);
        }
        catch (error) {
            logger_1.default.error('Cache set error:', { key, error });
        }
    }
    async delete(key) {
        if (!this.isAvailable())
            return;
        try {
            await this.client.del(key);
        }
        catch (error) {
            logger_1.default.error('Cache delete error:', { key, error });
        }
    }
    async deletePattern(pattern) {
        if (!this.isAvailable())
            return;
        try {
            const keys = await this.client.keys(pattern);
            if (keys.length > 0) {
                await this.client.del(keys);
            }
        }
        catch (error) {
            logger_1.default.error('Cache delete pattern error:', { pattern, error });
        }
    }
    async exists(key) {
        if (!this.isAvailable())
            return false;
        try {
            const result = await this.client.exists(key);
            return result === 1;
        }
        catch (error) {
            logger_1.default.error('Cache exists error:', { key, error });
            return false;
        }
    }
    async ttl(key) {
        if (!this.isAvailable())
            return -1;
        try {
            return await this.client.ttl(key);
        }
        catch (error) {
            logger_1.default.error('Cache ttl error:', { key, error });
            return -1;
        }
    }
    async increment(key, amount = 1) {
        if (!this.isAvailable())
            return 0;
        try {
            return await this.client.incrBy(key, amount);
        }
        catch (error) {
            logger_1.default.error('Cache increment error:', { key, error });
            return 0;
        }
    }
    async expire(key, seconds) {
        if (!this.isAvailable())
            return;
        try {
            await this.client.expire(key, seconds);
        }
        catch (error) {
            logger_1.default.error('Cache expire error:', { key, error });
        }
    }
    // =============================================================================
    // Utility Methods
    // =============================================================================
    isAvailable() {
        return this.isConnected && !this.circuitOpen && !!this.client;
    }
    generateKey(...parts) {
        return parts.join(':');
    }
    // =============================================================================
    // Cache Warming
    // =============================================================================
    async warmCache(keys, fetcher, ttl = DEFAULT_TTL) {
        if (!this.isAvailable())
            return;
        const promises = keys.map(async (key) => {
            try {
                const exists = await this.exists(key);
                if (!exists) {
                    const value = await fetcher(key);
                    await this.set(key, value, ttl);
                }
            }
            catch (error) {
                logger_1.default.error('Cache warming error:', { key, error });
            }
        });
        await Promise.all(promises);
    }
}
// =============================================================================
// Singleton Instance
// =============================================================================
exports.cache = new CacheClient();
// =============================================================================
// Cache Decorator
// =============================================================================
function cached(keyGenerator, ttl = DEFAULT_TTL) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args) {
            const cacheKey = keyGenerator(...args);
            // Try to get from cache
            const cached = await exports.cache.get(cacheKey);
            if (cached !== null) {
                return cached;
            }
            // Execute original method
            const result = await originalMethod.apply(this, args);
            // Store in cache
            await exports.cache.set(cacheKey, result, ttl);
            return result;
        };
        return descriptor;
    };
}
// =============================================================================
// Cache Key Generators
// =============================================================================
exports.CacheKeys = {
    user: (userId) => exports.cache.generateKey('user', userId),
    proposal: (proposalId) => exports.cache.generateKey('proposal', proposalId),
    proposalsByUser: (userId) => exports.cache.generateKey('proposals', 'user', userId),
    company: (companyId) => exports.cache.generateKey('company', companyId),
    searchResults: (query) => exports.cache.generateKey('search', query),
    dashboard: (userId) => exports.cache.generateKey('dashboard', userId),
    rateLimit: (identifier) => exports.cache.generateKey('ratelimit', identifier),
    session: (sessionId) => exports.cache.generateKey('session', sessionId),
};
exports.default = exports.cache;
//# sourceMappingURL=cache.js.map