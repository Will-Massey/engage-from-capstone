"use strict";
/**
 * =============================================================================
 * Health Check Middleware
 * =============================================================================
 * Comprehensive health checks for:
 * - Application status
 * - Database connectivity
 * - Redis connectivity
 * - External service dependencies
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRouter = void 0;
const express_1 = require("express");
const client_1 = require("@prisma/client");
const redis_1 = require("redis");
const prisma = new client_1.PrismaClient();
// =============================================================================
// Check Functions
// =============================================================================
const checkDatabase = async () => {
    const start = Date.now();
    try {
        // Simple query to verify database connection
        await prisma.$queryRaw `SELECT 1`;
        return {
            status: 'pass',
            responseTime: Date.now() - start,
        };
    }
    catch (error) {
        return {
            status: 'fail',
            responseTime: Date.now() - start,
            message: error instanceof Error ? error.message : 'Database connection failed',
        };
    }
};
const checkRedis = async () => {
    const start = Date.now();
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
        return {
            status: 'warn',
            responseTime: 0,
            message: 'Redis not configured',
        };
    }
    try {
        const client = (0, redis_1.createClient)({ url: redisUrl });
        await client.connect();
        await client.ping();
        await client.disconnect();
        return {
            status: 'pass',
            responseTime: Date.now() - start,
        };
    }
    catch (error) {
        return {
            status: 'fail',
            responseTime: Date.now() - start,
            message: error instanceof Error ? error.message : 'Redis connection failed',
        };
    }
};
const checkMemory = () => {
    const start = Date.now();
    const used = process.memoryUsage();
    const maxHeap = 512 * 1024 * 1024; // 512MB threshold
    const heapUsedPercent = (used.heapUsed / maxHeap) * 100;
    let status = 'pass';
    let message;
    if (heapUsedPercent > 90) {
        status = 'fail';
        message = `Memory usage critical: ${heapUsedPercent.toFixed(1)}%`;
    }
    else if (heapUsedPercent > 75) {
        status = 'warn';
        message = `Memory usage high: ${heapUsedPercent.toFixed(1)}%`;
    }
    return {
        status,
        responseTime: Date.now() - start,
        message,
        details: {
            heapUsed: `${(used.heapUsed / 1024 / 1024).toFixed(2)} MB`,
            heapTotal: `${(used.heapTotal / 1024 / 1024).toFixed(2)} MB`,
            rss: `${(used.rss / 1024 / 1024).toFixed(2)} MB`,
            external: `${(used.external / 1024 / 1024).toFixed(2)} MB`,
            percentage: `${heapUsedPercent.toFixed(1)}%`,
        },
    };
};
// =============================================================================
// Health Check Router
// =============================================================================
exports.healthRouter = (0, express_1.Router)();
// Simple ping endpoint (for load balancers)
exports.healthRouter.get('/ping', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Basic health check
exports.healthRouter.get('/health', async (_req, res) => {
    const dbCheck = await checkDatabase();
    const isHealthy = dbCheck.status === 'pass';
    const statusCode = isHealthy ? 200 : 503;
    res.status(statusCode).json({
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || 'unknown',
        checks: {
            database: dbCheck,
        },
    });
});
// Comprehensive health check
exports.healthRouter.get('/health/detailed', async (_req, res) => {
    const [dbCheck, redisCheck, memoryCheck] = await Promise.all([
        checkDatabase(),
        checkRedis(),
        Promise.resolve(checkMemory()),
    ]);
    const checks = {
        database: dbCheck,
        redis: redisCheck,
        memory: memoryCheck,
    };
    // Determine overall status
    const failedChecks = Object.values(checks).filter((c) => c.status === 'fail').length;
    const warningChecks = Object.values(checks).filter((c) => c.status === 'warn').length;
    let overallStatus = 'healthy';
    if (failedChecks > 0) {
        overallStatus = 'unhealthy';
    }
    else if (warningChecks > 0) {
        overallStatus = 'degraded';
    }
    const statusCode = overallStatus === 'unhealthy' ? 503 : 200;
    const healthStatus = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || 'unknown',
        uptime: process.uptime(),
        checks,
    };
    res.status(statusCode).json(healthStatus);
});
// Readiness check (for Kubernetes)
exports.healthRouter.get('/ready', async (_req, res) => {
    const dbCheck = await checkDatabase();
    if (dbCheck.status === 'pass') {
        res.status(200).json({ ready: true });
    }
    else {
        res.status(503).json({ ready: false, reason: 'Database not ready' });
    }
});
// Liveness check (for Kubernetes)
exports.healthRouter.get('/live', (_req, res) => {
    res.status(200).json({ alive: true });
});
exports.default = exports.healthRouter;
//# sourceMappingURL=healthCheck.js.map