"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_js_1 = require("../config/database.js");
const errorHandler_js_1 = require("../middleware/errorHandler.js");
const router = (0, express_1.Router)();
/**
 * GET /api/diagnostics/health
 * Public health check endpoint
 */
router.get('/health', (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const checks = {
        timestamp: new Date().toISOString(),
        status: 'healthy',
        checks: {},
    };
    try {
        // Database check
        await database_js_1.prisma.$queryRaw `SELECT 1`;
        checks.checks.database = { status: 'ok', message: 'Connected' };
    }
    catch (error) {
        checks.status = 'unhealthy';
        checks.checks.database = {
            status: 'error',
            message: error.message,
        };
    }
    // Check if required fields exist
    try {
        const test = await database_js_1.prisma.proposalService.findFirst({
            select: { displayPrice: true },
        });
        checks.checks.migration = {
            status: 'ok',
            message: 'v2 pricing fields exist',
        };
    }
    catch (error) {
        checks.status = 'degraded';
        checks.checks.migration = {
            status: 'error',
            message: 'Migration needed: ' + error.message,
        };
    }
    const statusCode = checks.status === 'healthy' ? 200 : checks.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(checks);
}));
/**
 * GET /api/diagnostics/db-status
 * Detailed database status (admin only)
 */
router.get('/db-status', (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    // Simple auth check - require API key or admin
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.DIAGNOSTICS_API_KEY) {
        return res.status(401).json({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
        });
    }
    const status = {
        timestamp: new Date().toISOString(),
        database: {},
        tables: {},
    };
    try {
        // Connection test
        const dbResult = await database_js_1.prisma.$queryRaw `SELECT NOW()`;
        status.database.connected = true;
        status.database.serverTime = dbResult[0].now;
        // Table counts
        status.tables.proposals = await database_js_1.prisma.proposal.count();
        status.tables.clients = await database_js_1.prisma.client.count();
        status.tables.services = await database_js_1.prisma.serviceTemplate.count();
        status.tables.users = await database_js_1.prisma.user.count();
        // Check columns in ProposalService
        try {
            const columns = await database_js_1.prisma.$queryRaw `
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'ProposalService'
          ORDER BY column_name
        `;
            status.tables.proposalServiceColumns = columns.map((c) => c.column_name);
            // Check for v2 fields
            const hasV2Fields = status.tables.proposalServiceColumns.includes('displayPrice');
            status.migrationStatus = hasV2Fields ? 'v2_complete' : 'v1_legacy';
        }
        catch (e) {
            status.tables.proposalServiceColumns = ['Error: ' + e.message];
        }
        res.json({
            success: true,
            data: status,
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: {
                code: 'DB_ERROR',
                message: error.message,
            },
        });
    }
}));
exports.default = router;
//# sourceMappingURL=diagnostics.js.map