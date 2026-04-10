"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const errorHandler_js_1 = require("../middleware/errorHandler.js");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
/**
 * GET /api/setup
 * One-time setup endpoint to create demo user
 */
router.get('/', (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    // Check if setup already completed
    const existingUser = await prisma.user.findFirst({
        where: { email: 'admin@demo.practice' }
    });
    if (existingUser) {
        res.json({
            success: true,
            message: 'Setup already completed',
            user: {
                email: existingUser.email,
                role: existingUser.role
            }
        });
        return;
    }
    // Create demo tenant
    let tenant = await prisma.tenant.findFirst({
        where: { subdomain: 'demo' }
    });
    if (!tenant) {
        tenant = await prisma.tenant.create({
            data: {
                name: 'Demo Accounting Practice',
                subdomain: 'demo',
                primaryColor: '#0ea5e9',
            }
        });
    }
    // Create demo admin user
    const user = await prisma.user.create({
        data: {
            email: 'admin@demo.practice',
            passwordHash: await bcryptjs_1.default.hash('DemoPass123!', 12),
            firstName: 'Admin',
            lastName: 'User',
            role: 'ADMIN',
            tenantId: tenant.id,
            isActive: true,
        }
    });
    res.json({
        success: true,
        message: 'Setup completed successfully',
        credentials: {
            email: user.email,
            password: 'DemoPass123!'
        }
    });
}));
/**
 * POST /api/setup/migrate-pricing
 * Run v2 pricing data migration
 */
router.post('/migrate-pricing', (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const secret = req.headers['x-migration-key'];
    if (secret !== 'engage-migrate-2024') {
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
        res.status(500).json({ success: false, error: error.message });
    }
}));
exports.default = router;
//# sourceMappingURL=setup.js.map