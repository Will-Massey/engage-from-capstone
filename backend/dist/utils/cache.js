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
import { createClient } from 'redis';
import logger from './logger';
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
            logger.warn('Redis URL not configured, caching disabled');
            return;
        }
        this.client = createClient({
            url: REDIS_URL,
            socket: {
                reconnectStrategy: (retries) => {
                    if (retries > MAX_RETRIES) {
                        logger.error('Max Redis reconnection attempts reached');
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
            logger.info('Redis client connected');
            this.isConnected = true;
            this.retryCount = 0;
            this.closeCircuit();
        });
        this.client.on('error', (err) => {
            logger.error('Redis client error:', err);
            this.isConnected = false;
        });
        this.client.on('disconnect', () => {
            logger.warn('Redis client disconnected');
            this.isConnected = false;
        });
    }
    openCircuit() {
        this.circuitOpen = true;
        logger.warn('Cache circuit breaker opened');
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
        logger.info('Cache circuit breaker closed');
    }
    async connect() {
        if (!this.client || this.isConnected)
            return;
        try {
            await this.client.connect();
        }
        catch (error) {
            logger.error('Failed to connect to Redis:', error);
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
            logger.error('Error disconnecting from Redis:', error);
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
            logger.error('Cache get error:', { key, error });
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
            logger.error('Cache set error:', { key, error });
        }
    }
    async delete(key) {
        if (!this.isAvailable())
            return;
        try {
            await this.client.del(key);
        }
        catch (error) {
            logger.error('Cache delete error:', { key, error });
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
            logger.error('Cache delete pattern error:', { pattern, error });
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
            logger.error('Cache exists error:', { key, error });
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
            logger.error('Cache ttl error:', { key, error });
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
            logger.error('Cache increment error:', { key, error });
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
            logger.error('Cache expire error:', { key, error });
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
                logger.error('Cache warming error:', { key, error });
            }
        });
        await Promise.all(promises);
    }
}
// =============================================================================
// Singleton Instance
// =============================================================================
export const cache = new CacheClient();
// =============================================================================
// Cache Decorator
// =============================================================================
export function cached(keyGenerator, ttl = DEFAULT_TTL) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args) {
            const cacheKey = keyGenerator(...args);
            // Try to get from cache
            const cached = await cache.get(cacheKey);
            if (cached !== null) {
                return cached;
            }
            // Execute original method
            const result = await originalMethod.apply(this, args);
            // Store in cache
            await cache.set(cacheKey, result, ttl);
            return result;
        };
        return descriptor;
    };
}
// =============================================================================
// Cache Key Generators
// =============================================================================
export const CacheKeys = {
    user: (userId) => cache.generateKey('user', userId),
    proposal: (proposalId) => cache.generateKey('proposal', proposalId),
    proposalsByUser: (userId) => cache.generateKey('proposals', 'user', userId),
    company: (companyId) => cache.generateKey('company', companyId),
    searchResults: (query) => cache.generateKey('search', query),
    dashboard: (userId) => cache.generateKey('dashboard', userId),
    rateLimit: (identifier) => cache.generateKey('ratelimit', identifier),
    session: (sessionId) => cache.generateKey('session', sessionId),
};
export default cache;
