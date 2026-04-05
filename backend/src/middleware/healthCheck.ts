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

import { Request, Response, Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';

const prisma = new PrismaClient();

// =============================================================================
// Health Check Configuration
// =============================================================================
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: CheckResult;
    redis: CheckResult;
    memory: CheckResult;
    disk?: CheckResult;
  };
}

interface CheckResult {
  status: 'pass' | 'fail' | 'warn';
  responseTime: number;
  message?: string;
  details?: Record<string, unknown>;
}

// =============================================================================
// Check Functions
// =============================================================================

const checkDatabase = async (): Promise<CheckResult> => {
  const start = Date.now();
  try {
    // Simple query to verify database connection
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'pass',
      responseTime: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'fail',
      responseTime: Date.now() - start,
      message: error instanceof Error ? error.message : 'Database connection failed',
    };
  }
};

const checkRedis = async (): Promise<CheckResult> => {
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
    const client = createClient({ url: redisUrl });
    await client.connect();
    await client.ping();
    await client.disconnect();
    return {
      status: 'pass',
      responseTime: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'fail',
      responseTime: Date.now() - start,
      message: error instanceof Error ? error.message : 'Redis connection failed',
    };
  }
};

const checkMemory = (): CheckResult => {
  const start = Date.now();
  const used = process.memoryUsage();
  const maxHeap = 512 * 1024 * 1024; // 512MB threshold
  
  const heapUsedPercent = (used.heapUsed / maxHeap) * 100;
  
  let status: CheckResult['status'] = 'pass';
  let message: string | undefined;
  
  if (heapUsedPercent > 90) {
    status = 'fail';
    message = `Memory usage critical: ${heapUsedPercent.toFixed(1)}%`;
  } else if (heapUsedPercent > 75) {
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
export const healthRouter = Router();

// Simple ping endpoint (for load balancers)
healthRouter.get('/ping', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Basic health check
healthRouter.get('/health', async (_req: Request, res: Response) => {
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
healthRouter.get('/health/detailed', async (_req: Request, res: Response) => {
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
  const failedChecks = Object.values(checks).filter(c => c.status === 'fail').length;
  const warningChecks = Object.values(checks).filter(c => c.status === 'warn').length;
  
  let overallStatus: HealthStatus['status'] = 'healthy';
  if (failedChecks > 0) {
    overallStatus = 'unhealthy';
  } else if (warningChecks > 0) {
    overallStatus = 'degraded';
  }

  const statusCode = overallStatus === 'unhealthy' ? 503 : 200;

  const healthStatus: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || 'unknown',
    uptime: process.uptime(),
    checks,
  };

  res.status(statusCode).json(healthStatus);
});

// Readiness check (for Kubernetes)
healthRouter.get('/ready', async (_req: Request, res: Response) => {
  const dbCheck = await checkDatabase();
  
  if (dbCheck.status === 'pass') {
    res.status(200).json({ ready: true });
  } else {
    res.status(503).json({ ready: false, reason: 'Database not ready' });
  }
});

// Liveness check (for Kubernetes)
healthRouter.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({ alive: true });
});

export default healthRouter;
