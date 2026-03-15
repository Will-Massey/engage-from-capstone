import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database.js';

// Extract tenant from subdomain
export const extractTenant = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get subdomain from request
    const host = req.headers.host || '';
    const subdomain = extractSubdomain(host);

    if (!subdomain) {
      // No subdomain - continue without tenant (routes can handle this)
      return next();
    }

    // Find tenant by subdomain
    const tenant = await prisma.tenant.findFirst({
      where: {
        subdomain,
        isActive: true,
      },
    });

    if (!tenant) {
      // Tenant not found - continue without tenant (routes can handle this)
      return next();
    }

    // Attach tenant to request
    req.tenantId = tenant.id;
    (req as any).tenant = tenant;

    next();
  } catch (error) {
    console.error('Tenant extraction error:', error);
    // Continue without tenant on error
    next();
  }
};

// Extract subdomain from hostname
function extractSubdomain(hostname: string): string | null {
  // Handle localhost:port
  if (hostname.includes('localhost')) {
    return 'demo'; // Default for local development
  }

  // Handle IP addresses
  if (/^\d+\.\d+\.\d+\.\d+/.test(hostname)) {
    return 'demo';
  }

  // Handle Railway domains - use default tenant
  if (hostname.includes('up.railway.app')) {
    return 'demo';
  }

  // Handle Render domains - use default tenant
  if (hostname.includes('onrender.com')) {
    return 'demo';
  }

  const parts = hostname.split('.');
  
  // Handle custom domain with subdomain
  if (parts.length >= 3) {
    return parts[0].toLowerCase();
  }

  // Handle custom domain without subdomain
  return null;
}

// Tenant header middleware (for API clients)
export const tenantHeader = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      // Fall back to subdomain extraction
      return extractTenant(req, res, next);
    }

    // Verify tenant exists
    const tenant = await prisma.tenant.findFirst({
      where: {
        id: tenantId,
        isActive: true,
      },
    });

    if (!tenant) {
      res.status(404).json({
        success: false,
        error: {
          code: 'TENANT_NOT_FOUND',
          message: 'Tenant not found or inactive',
        },
      });
      return;
    }

    req.tenantId = tenant.id;
    (req as any).tenant = tenant;

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to extract tenant',
      },
    });
  }
};

// Validate user belongs to tenant
export const validateTenantMembership = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
    return;
  }

  if (req.user.tenantId !== req.tenantId) {
    res.status(403).json({
      success: false,
      error: {
        code: 'TENANT_MISMATCH',
        message: 'User does not belong to this tenant',
      },
    });
    return;
  }

  next();
};

export default { extractTenant, tenantHeader, validateTenantMembership };
