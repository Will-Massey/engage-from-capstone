"use strict";
/**
 * Health Check Routes
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Root health endpoint (for Render and load balancers)
router.get('/', async (_req, res) => {
    try {
        await prisma.$queryRaw `SELECT 1`;
        // Check tenant configuration
        const tenant = await prisma.tenant.findFirst({
            where: { subdomain: 'demo' },
        });
        if (!tenant) {
            res.status(503).json({
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: 'Tenant not configured',
            });
            return;
        }
        res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: process.env.npm_package_version || 'unknown',
            tenant: {
                id: tenant.id,
                name: tenant.name,
                subdomain: tenant.subdomain,
            },
        });
    }
    catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: 'Database connection failed',
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
        await prisma.$queryRaw `SELECT 1`;
        res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: process.env.npm_package_version || 'unknown',
        });
    }
    catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: 'Database connection failed',
        });
    }
});
// Readiness check (for Kubernetes)
router.get('/ready', async (_req, res) => {
    try {
        await prisma.$queryRaw `SELECT 1`;
        res.status(200).json({ ready: true });
    }
    catch (error) {
        res.status(503).json({ ready: false, reason: 'Database not ready' });
    }
});
// Liveness check (for Kubernetes)
router.get('/live', (_req, res) => {
    res.status(200).json({ alive: true });
});
// Data migration endpoint (temporary - for v2 pricing migration)
router.post('/migrate-data', async (req, res) => {
    const secret = req.headers['x-migration-key'];
    if (secret !== 'engage-migrate-2024') {
        return res.status(403).json({ success: false, error: 'Invalid key' });
    }
    try {
        // Get services that need updating
        const services = await prisma.serviceTemplate.findMany({
            where: {
                OR: [
                    { priceAmount: 0 },
                    { priceAmount: null },
                ],
                basePrice: { gt: 0 },
            },
        });
        let updated = 0;
        for (const service of services) {
            try {
                let billingCycle = service.defaultFrequency || 'MONTHLY';
                if (billingCycle === 'ONE_TIME')
                    billingCycle = 'MONTHLY';
                let priceDisplayMode = 'PER_MONTH';
                if (billingCycle === 'ANNUALLY')
                    priceDisplayMode = 'PER_YEAR';
                else if (billingCycle === 'QUARTERLY')
                    priceDisplayMode = 'PER_QUARTER';
                await prisma.serviceTemplate.update({
                    where: { id: service.id },
                    data: {
                        priceAmount: service.basePrice,
                        billingCycle: billingCycle,
                        priceDisplayMode: priceDisplayMode,
                    },
                });
                updated++;
            }
            catch (e) {
                console.error(`Failed to update ${service.name}:`, e);
            }
        }
        res.json({
            success: true,
            message: `Migration complete: ${updated}/${services.length} services updated`,
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
exports.default = router;
//# sourceMappingURL=health.js.map