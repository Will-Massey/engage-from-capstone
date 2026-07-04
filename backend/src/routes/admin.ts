/**
 * Admin routes for database management
 * Protected by secret key - no auth required
 */

import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { prisma } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { secureCompare } from '../utils/secureCompare.js';
import { logOpsAccess } from '../utils/opsAudit.js';
import logger from '../utils/logger.js';

const router = Router();
const execFileAsync = promisify(execFile);

const ADMIN_KEY = process.env.ADMIN_SECRET_KEY;

async function runPrismaMigrateDeploy(): Promise<void> {
  try {
    await execFileAsync(
      'npx',
      ['prisma', 'migrate', 'resolve', '--rolled-back', '20260410_data_migration_v2_pricing'],
      { cwd: process.cwd(), timeout: 120_000 }
    );
  } catch {
    // Migration may already be resolved
  }

  await execFileAsync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: process.cwd(),
    timeout: 300_000,
  });
}

const checkAdminKey = (req: any, res: any, next: any) => {
  if (!ADMIN_KEY) {
    return res.status(503).json({
      success: false,
      error: 'Admin routes are not configured (missing ADMIN_SECRET_KEY)',
    });
  }
  if (req.query.key) {
    return res.status(400).json({
      success: false,
      error: 'Pass the admin key via X-Admin-Key header only',
    });
  }
  const key = req.headers['x-admin-key'];
  if (!secureCompare(key, ADMIN_KEY)) {
    return res.status(403).json({ success: false, error: 'Invalid admin key' });
  }
  next();
};

/**
 * POST /api/admin/migrate
 * Run pending database migrations
 */
router.post(
  '/migrate',
  checkAdminKey,
  asyncHandler(async (req, res) => {
    logOpsAccess(req, 'admin.migrate');
    try {
      await runPrismaMigrateDeploy();
      res.json({
        success: true,
        message: 'Migrations applied successfully',
      });
    } catch (error) {
      logger.error('Admin migration failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: 'Migration failed',
      });
    }
  })
);

/**
 * POST /api/admin/fix-schema
 * Direct SQL fix for missing columns
 */
router.post(
  '/fix-schema',
  checkAdminKey,
  asyncHandler(async (req, res) => {
    logOpsAccess(req, 'admin.fix-schema');
    try {
      const fixes = [];

      try {
        const result = await prisma.$queryRaw`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'ServiceTemplate' 
          AND column_name = 'billingCycle'
        `;

        if ((result as any[]).length === 0) {
          await prisma.$executeRaw`ALTER TABLE "ServiceTemplate" ADD COLUMN "billingCycle" TEXT DEFAULT 'MONTHLY'`;
          fixes.push('Added billingCycle column to ServiceTemplate');
        } else {
          fixes.push('billingCycle column already exists');
        }
      } catch (e: any) {
        fixes.push(`billingCycle check error: ${e.message}`);
      }

      try {
        const result = await prisma.$queryRaw`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'ServiceTemplate' 
          AND column_name = 'priceDisplayMode'
        `;

        if ((result as any[]).length === 0) {
          await prisma.$executeRaw`ALTER TABLE "ServiceTemplate" ADD COLUMN "priceDisplayMode" TEXT DEFAULT 'PER_MONTH'`;
          fixes.push('Added priceDisplayMode column to ServiceTemplate');
        } else {
          fixes.push('priceDisplayMode column already exists');
        }
      } catch (e: any) {
        fixes.push(`priceDisplayMode check error: ${e.message}`);
      }

      res.json({
        success: true,
        message: 'Schema fixes applied',
        fixes,
      });
    } catch (error) {
      logger.error('Admin schema fix failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: 'Schema fix failed',
      });
    }
  })
);

/**
 * GET /api/admin/db-status
 * Check database status
 */
router.get(
  '/db-status',
  checkAdminKey,
  asyncHandler(async (req, res) => {
    logOpsAccess(req, 'admin.db-status');
    try {
      const columns = await prisma.$queryRaw`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'ServiceTemplate'
      `;

      const migrations = await prisma.$queryRaw`
        SELECT migration_name, finished_at, applied_steps_count
        FROM _prisma_migrations
        ORDER BY finished_at DESC
        LIMIT 10
      `;

      res.json({
        success: true,
        serviceTemplateColumns: (columns as any[]).map((c) => c.column_name),
        recentMigrations: migrations,
      });
    } catch (error) {
      logger.error('Admin db-status failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: 'Database status check failed',
      });
    }
  })
);

export default router;