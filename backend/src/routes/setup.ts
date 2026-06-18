import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();
const prisma = new PrismaClient();

const setupEnabled =
  process.env.NODE_ENV !== 'production' || process.env.ENABLE_SETUP_ENDPOINT === 'true';

const SETUP_SECRET = process.env.SETUP_SECRET_KEY;

function checkSetupKey(req: any, res: any, next: any) {
  if (!SETUP_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({ success: false, error: 'Setup is not configured' });
    }
    return next();
  }
  const key = req.headers['x-setup-key'];
  if (key !== SETUP_SECRET) {
    return res.status(403).json({ success: false, error: 'Invalid setup key' });
  }
  next();
}

/**
 * GET /api/setup
 * One-time setup endpoint to create demo user
 */
router.get(
  '/',
  checkSetupKey,
  asyncHandler(async (req, res) => {
    if (!setupEnabled) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }
    // Check if setup already completed
    const existingUser = await prisma.user.findFirst({
      where: { email: 'admin@demo.practice' },
    });

    if (existingUser) {
      res.json({
        success: true,
        message: 'Setup already completed',
        user: {
          email: existingUser.email,
          role: existingUser.role,
        },
      });
      return;
    }

    // Create demo tenant
    let tenant = await prisma.tenant.findFirst({
      where: { subdomain: 'demo' },
    });

    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          name: 'Demo Accounting Practice',
          subdomain: 'demo',
          primaryColor: '#0ea5e9',
        },
      });
    }

    // Create demo admin user
    const user = await prisma.user.create({
      data: {
        email: 'admin@demo.practice',
        passwordHash: await bcrypt.hash('DemoPass123!', 12),
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        tenantId: tenant.id,
        isActive: true,
      },
    });

    res.json({
      success: true,
      message: 'Setup completed successfully',
      user: {
        email: user.email,
        role: user.role,
      },
    });
  })
);

/**
 * POST /api/setup/migrate-pricing
 * Run v2 pricing data migration
 */
router.post(
  '/migrate-pricing',
  asyncHandler(async (req, res) => {
    if (!setupEnabled) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }

    const expected = process.env.MIGRATION_SECRET_KEY;
    if (!expected) {
      res.status(503).json({
        success: false,
        error: 'Migration endpoint not configured (missing MIGRATION_SECRET_KEY)',
      });
      return;
    }

    const secret = req.headers['x-migration-key'];
    if (secret !== expected) {
      return res.status(403).json({ success: false, error: 'Invalid key' });
    }

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
        } catch (e) {
          console.error(`Failed to update ${service.name}:`, e);
        }
      }

      res.json({
        success: true,
        message: `Migration complete: ${updated}/${services.length} services updated`,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  })
);

export default router;
