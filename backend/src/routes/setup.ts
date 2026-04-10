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
router.get(
  '/',
  asyncHandler(async (req, res) => {
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
  })
);

/**
 * POST /api/setup/migrate-pricing
 * Run v2 pricing data migration
 */
router.post(
  '/migrate-pricing',
  asyncHandler(async (req, res) => {
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
