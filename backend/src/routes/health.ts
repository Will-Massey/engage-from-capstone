/**
 * Health Check Routes
 */

import { Router } from 'express';
import { prisma } from '../config/database.js';
import { secureCompare } from '../utils/secureCompare.js';
import { logOpsAccess } from '../utils/opsAudit.js';

const router = Router();

// Root health endpoint (for Render and load balancers)
router.get('/', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
    });
  }
});

// Simple ping endpoint (for load balancers)
router.get('/ping', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Basic health check
router.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
    });
  }
});

// Readiness check (for Kubernetes)
router.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ ready: true });
  } catch {
    res.status(503).json({ ready: false });
  }
});

// Liveness check (for Kubernetes)
router.get('/live', (_req, res) => {
  res.status(200).json({ alive: true });
});

// Data migration endpoint (temporary - for v2 pricing migration)
router.post('/migrate-data', async (req, res) => {
  const enabled =
    process.env.NODE_ENV !== 'production' || process.env.ENABLE_SETUP_ENDPOINT === 'true';
  if (!enabled) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }

  const expected = process.env.MIGRATION_SECRET_KEY;
  if (!expected) {
    return res.status(503).json({
      success: false,
      error: 'Migration endpoint not configured',
    });
  }

  const secret = req.headers['x-migration-key'];
  if (!secureCompare(secret, expected)) {
    return res.status(403).json({ success: false, error: 'Invalid key' });
  }

  logOpsAccess(req, 'health.migrate-data');

  try {
    const services = await prisma.serviceTemplate.findMany({
      where: {
        OR: [{ priceAmount: 0 }, { priceAmount: null }],
        basePrice: { gt: 0 },
      },
    });

    let updated = 0;

    for (const service of services) {
      try {
        let billingCycle: any = service.defaultFrequency || 'MONTHLY';
        if (billingCycle === 'ONE_TIME') billingCycle = 'MONTHLY';

        let priceDisplayMode: any = 'PER_MONTH';
        if (billingCycle === 'ANNUALLY') priceDisplayMode = 'PER_YEAR';
        else if (billingCycle === 'QUARTERLY') priceDisplayMode = 'PER_QUARTER';

        await prisma.serviceTemplate.update({
          where: { id: service.id },
          data: {
            priceAmount: service.basePrice,
            billingCycle: billingCycle,
            priceDisplayMode: priceDisplayMode,
          },
        });
        updated++;
      } catch {
        // continue with remaining services
      }
    }

    res.json({
      success: true,
      message: `Migration complete: ${updated}/${services.length} services updated`,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: 'Migration failed',
    });
  }
});

export default router;
