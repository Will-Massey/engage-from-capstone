import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { clearLoginAttempts } from '../utils/loginLockout.js';
import { provisionTenantEngageLibrary } from '../services/tenantLibraryProvisionService.js';
import { secureCompare } from '../utils/secureCompare.js';
import { logOpsAccess } from '../utils/opsAudit.js';
import { validatePasswordStrength } from '../utils/passwordPolicy.js';

const router = Router();
const prisma = new PrismaClient();

const setupEnabled =
  process.env.NODE_ENV !== 'production' || process.env.ENABLE_SETUP_ENDPOINT === 'true';

const SETUP_SECRET = process.env.SETUP_SECRET_KEY;

/**
 * Resolve the demo admin password. The well-known 'DemoPass123!' is only used
 * outside production; in production a strong SETUP_ADMIN_PASSWORD must be
 * provided, so a publicly-documented credential is never created live.
 */
function resolveSetupAdminPassword(): string | null {
  if (process.env.NODE_ENV === 'production') {
    const pwd = process.env.SETUP_ADMIN_PASSWORD;
    return pwd && validatePasswordStrength(pwd).isValid ? pwd : null;
  }
  return process.env.SETUP_ADMIN_PASSWORD || 'DemoPass123!';
}

function checkSetupKey(req: any, res: any, next: any) {
  if (process.env.NODE_ENV === 'production' && !SETUP_SECRET) {
    return res.status(503).json({ success: false, error: 'Setup is not configured' });
  }
  if (!SETUP_SECRET) {
    return next();
  }
  const key = req.headers['x-setup-key'];
  if (!secureCompare(key, SETUP_SECRET)) {
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
    logOpsAccess(req, 'setup.root');
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
    const adminPassword = resolveSetupAdminPassword();
    if (!adminPassword) {
      res.status(400).json({
        success: false,
        error:
          'Set SETUP_ADMIN_PASSWORD (min 12 chars with complexity) to run setup in production.',
      });
      return;
    }
    const user = await prisma.user.create({
      data: {
        email: 'admin@demo.practice',
        passwordHash: await bcrypt.hash(adminPassword, 12),
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        tenantId: tenant.id,
        isActive: true,
        emailVerified: new Date(),
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
  checkSetupKey,
  asyncHandler(async (req, res) => {
    if (!setupEnabled) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }
    logOpsAccess(req, 'setup.migrate-pricing');

    const expected = process.env.MIGRATION_SECRET_KEY;
    if (!expected) {
      res.status(503).json({
        success: false,
        error: 'Migration endpoint not configured',
      });
      return;
    }

    const secret = req.headers['x-migration-key'];
    if (!secureCompare(secret, expected)) {
      return res.status(403).json({ success: false, error: 'Invalid key' });
    }

    try {
      const services = await prisma.serviceTemplate.findMany({
        // priceAmount is a non-nullable Float (@default(0)); the old `null`
        // branch never matched. Zero-priced templates with a real basePrice.
        where: {
          priceAmount: 0,
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
    } catch {
      res.status(500).json({ success: false, error: 'Migration failed' });
    }
  })
);

/**
 * POST /api/setup/clear-login-lockout
 * Clear failed-login counters for a user (ops / smoke-test recovery).
 * Requires X-Setup-Key when SETUP_SECRET_KEY is configured.
 */
router.post(
  '/clear-login-lockout',
  checkSetupKey,
  asyncHandler(async (req, res) => {
    if (!setupEnabled) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }
    logOpsAccess(req, 'setup.clear-login-lockout');

    const { email, tenantId } = z
      .object({
        email: z.string().email(),
        tenantId: z.string().uuid().optional(),
      })
      .parse(req.body);

    let resolvedTenantId = tenantId;
    if (!resolvedTenantId) {
      const user = await prisma.user.findFirst({
        where: { email: email.toLowerCase(), isActive: true },
        select: { tenantId: true },
      });
      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }
      resolvedTenantId = user.tenantId;
    }

    await clearLoginAttempts(email, resolvedTenantId);

    res.json({
      success: true,
      message: `Login lockout cleared for ${email}`,
      tenantId: resolvedTenantId,
    });
  })
);

/**
 * POST /api/setup/seed-tenant-library
 * Ops: import UK catalogue + seed Engage proposal library for a tenant (by user email).
 * Requires X-Migration-Key when MIGRATION_SECRET_KEY is set.
 */
router.post(
  '/seed-tenant-library',
  checkSetupKey,
  asyncHandler(async (req, res) => {
    if (!setupEnabled) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }
    logOpsAccess(req, 'setup.seed-tenant-library');

    const expected = process.env.MIGRATION_SECRET_KEY;
    if (!expected) {
      res.status(503).json({
        success: false,
        error: 'Migration endpoint not configured',
      });
      return;
    }

    const secret = req.headers['x-migration-key'];
    if (!secureCompare(secret, expected)) {
      return res.status(403).json({ success: false, error: 'Invalid key' });
    }

    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase(), isActive: true },
      select: { id: true, tenantId: true, email: true },
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const result = await provisionTenantEngageLibrary(user.tenantId, user.id);

    res.json({
      success: true,
      data: {
        email: user.email,
        tenantId: user.tenantId,
        ...result,
      },
    });
  })
);

export default router;
