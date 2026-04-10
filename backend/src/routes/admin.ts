/**
 * Admin routes for database management
 * Protected by secret key - no auth required
 */

import { Router } from 'express';
import { execSync } from 'child_process';
import { prisma } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

const ADMIN_KEY = process.env.ADMIN_SECRET_KEY || 'capstone-admin-2026';

// Middleware to check admin key
const checkAdminKey = (req: any, res: any, next: any) => {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== ADMIN_KEY) {
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
    try {
      // First, try to resolve the failed migration
      try {
        execSync('npx prisma migrate resolve --rolled-back "20260410_data_migration_v2_pricing"', {
          cwd: process.cwd(),
          stdio: 'pipe'
        });
      } catch (e: any) {
        // Migration might already be resolved or not exist
        console.log('Migration resolve note:', e.message);
      }

      // Deploy migrations
      const output = execSync('npx prisma migrate deploy', {
        cwd: process.cwd(),
        stdio: 'pipe',
        encoding: 'utf-8'
      });

      res.json({
        success: true,
        message: 'Migrations applied successfully',
        output: output.toString()
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Migration failed',
        details: error.message,
        stdout: error.stdout?.toString(),
        stderr: error.stderr?.toString()
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
    try {
      const fixes = [];

      // Check and add billingCycle column
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

      // Check and add priceDisplayMode column  
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
        fixes
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Schema fix failed',
        details: error.message
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
    try {
      // Check ServiceTemplate columns
      const columns = await prisma.$queryRaw`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'ServiceTemplate'
      `;

      // Check migrations
      const migrations = await prisma.$queryRaw`
        SELECT migration_name, finished_at, applied_steps_count
        FROM _prisma_migrations
        ORDER BY finished_at DESC
        LIMIT 10
      `;

      res.json({
        success: true,
        serviceTemplateColumns: (columns as any[]).map(c => c.column_name),
        recentMigrations: migrations
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  })
);

export default router;
