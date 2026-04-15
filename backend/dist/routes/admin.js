"use strict";
/**
 * Admin routes for database management
 * Protected by secret key - no auth required
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const child_process_1 = require("child_process");
const database_js_1 = require("../config/database.js");
const errorHandler_js_1 = require("../middleware/errorHandler.js");
const router = (0, express_1.Router)();
const ADMIN_KEY = process.env.ADMIN_SECRET_KEY || 'capstone-admin-2026';
// Middleware to check admin key
const checkAdminKey = (req, res, next) => {
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
router.post('/migrate', checkAdminKey, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    try {
        // First, try to resolve the failed migration
        try {
            (0, child_process_1.execSync)('npx prisma migrate resolve --rolled-back "20260410_data_migration_v2_pricing"', {
                cwd: process.cwd(),
                stdio: 'pipe',
            });
        }
        catch (e) {
            // Migration might already be resolved or not exist
            console.log('Migration resolve note:', e.message);
        }
        // Deploy migrations
        const output = (0, child_process_1.execSync)('npx prisma migrate deploy', {
            cwd: process.cwd(),
            stdio: 'pipe',
            encoding: 'utf-8',
        });
        res.json({
            success: true,
            message: 'Migrations applied successfully',
            output: output.toString(),
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Migration failed',
            details: error.message,
            stdout: error.stdout?.toString(),
            stderr: error.stderr?.toString(),
        });
    }
}));
/**
 * POST /api/admin/fix-schema
 * Direct SQL fix for missing columns
 */
router.post('/fix-schema', checkAdminKey, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    try {
        const fixes = [];
        // Check and add billingCycle column
        try {
            const result = await database_js_1.prisma.$queryRaw `
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'ServiceTemplate' 
          AND column_name = 'billingCycle'
        `;
            if (result.length === 0) {
                await database_js_1.prisma.$executeRaw `ALTER TABLE "ServiceTemplate" ADD COLUMN "billingCycle" TEXT DEFAULT 'MONTHLY'`;
                fixes.push('Added billingCycle column to ServiceTemplate');
            }
            else {
                fixes.push('billingCycle column already exists');
            }
        }
        catch (e) {
            fixes.push(`billingCycle check error: ${e.message}`);
        }
        // Check and add priceDisplayMode column
        try {
            const result = await database_js_1.prisma.$queryRaw `
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'ServiceTemplate' 
          AND column_name = 'priceDisplayMode'
        `;
            if (result.length === 0) {
                await database_js_1.prisma.$executeRaw `ALTER TABLE "ServiceTemplate" ADD COLUMN "priceDisplayMode" TEXT DEFAULT 'PER_MONTH'`;
                fixes.push('Added priceDisplayMode column to ServiceTemplate');
            }
            else {
                fixes.push('priceDisplayMode column already exists');
            }
        }
        catch (e) {
            fixes.push(`priceDisplayMode check error: ${e.message}`);
        }
        res.json({
            success: true,
            message: 'Schema fixes applied',
            fixes,
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Schema fix failed',
            details: error.message,
        });
    }
}));
/**
 * GET /api/admin/db-status
 * Check database status
 */
router.get('/db-status', checkAdminKey, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    try {
        // Check ServiceTemplate columns
        const columns = await database_js_1.prisma.$queryRaw `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'ServiceTemplate'
      `;
        // Check migrations
        const migrations = await database_js_1.prisma.$queryRaw `
        SELECT migration_name, finished_at, applied_steps_count
        FROM _prisma_migrations
        ORDER BY finished_at DESC
        LIMIT 10
      `;
        res.json({
            success: true,
            serviceTemplateColumns: columns.map((c) => c.column_name),
            recentMigrations: migrations,
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
}));
exports.default = router;
//# sourceMappingURL=admin.js.map