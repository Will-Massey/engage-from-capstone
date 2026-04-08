import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database.js';
import logger from '../config/logger.js';

// Simple tenant extraction - always use 'demo' for Render
export const extractTenant = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // For Render deployment, always use demo tenant
    // Try demo-practice first (older seeds), then demo (newer seeds)
    let tenant = await prisma.tenant.findFirst({
      where: {
        subdomain: 'demo-practice',
      },
    });

    if (!tenant) {
      tenant = await prisma.tenant.findFirst({
        where: {
          subdomain: 'demo',
        },
      });
    }

    if (tenant) {
      req.tenantId = tenant.id;
      (req as any).tenant = tenant;
      logger.debug(`Tenant extracted: ${tenant.subdomain} (${tenant.id}) for path: ${req.path}`);
    } else {
      logger.warn(`No tenant found for request: ${req.path}`);
    }

    next();
  } catch (error) {
    logger.error('Tenant extraction error:', error);
    // Continue without tenant
    next();
  }
};

export default { extractTenant };
