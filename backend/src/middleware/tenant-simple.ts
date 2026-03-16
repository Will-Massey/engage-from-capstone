import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database.js';

// Simple tenant extraction - always use 'demo' for Render
export const extractTenant = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // For Render deployment, always use demo tenant
    const tenant = await prisma.tenant.findFirst({
      where: {
        subdomain: 'demo-practice',
      },
    });

    if (tenant) {
      req.tenantId = tenant.id;
      (req as any).tenant = tenant;
    }

    next();
  } catch (error) {
    console.error('Tenant extraction error:', error);
    // Continue without tenant
    next();
  }
};

export default { extractTenant };
