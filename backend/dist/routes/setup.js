import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { asyncHandler } from '../middleware/errorHandler.js';
const router = Router();
const prisma = new PrismaClient();
/**
 * GET /api/setup
 * One-time setup endpoint to create demo user
 */
router.get('/', asyncHandler(async (req, res) => {
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
            passwordHash: await bcrypt.hash('DemoPass123!', 12),
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
export default router;
