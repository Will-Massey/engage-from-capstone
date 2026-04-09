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
exports.default = router;
//# sourceMappingURL=setup.js.map