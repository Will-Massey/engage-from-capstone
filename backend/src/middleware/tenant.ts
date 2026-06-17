import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database.js';
import type { Prisma } from '@prisma/client';

type Tenant = Prisma.TenantGetPayload<object>;

const RESERVED_SUBDOMAINS = new Set([
  'www',
  'api',
  'app',
  'engage',
  'engage-backend',
  'engage-frontend',
]);

const PLATFORM_HOST_SUFFIXES = [
  '.onrender.com',
  '.up.railway.app',
  '.vercel.app',
];

/**
 * Parse tenant subdomain from Host header (without port).
 * Returns null when the host is a platform URL, bare domain, or reserved label.
 */
export function parseSubdomainFromHost(hostname: string): string | null {
  const host = (hostname.split(':')[0] || '').toLowerCase().trim();
  if (!host) return null;

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    /^127\.\d+\.\d+\.\d+$/.test(host) ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host)
  ) {
    return null;
  }

  if (PLATFORM_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return null;
  }

  const parts = host.split('.').filter(Boolean);
  if (parts.length < 3) {
    return null;
  }

  const subdomain = parts[0];
  if (!subdomain || RESERVED_SUBDOMAINS.has(subdomain)) {
    return null;
  }

  return subdomain;
}

function getSubdomainFromRequest(req: Request): string | null {
  const headerSubdomain = req.headers['x-tenant-subdomain'];
  if (typeof headerSubdomain === 'string' && headerSubdomain.trim()) {
    return headerSubdomain.trim().toLowerCase();
  }

  const queryTenant = req.query.tenant ?? req.query.tenantSubdomain;
  if (typeof queryTenant === 'string' && queryTenant.trim()) {
    return queryTenant.trim().toLowerCase();
  }

  const host = req.headers.host || req.headers['x-forwarded-host'];
  if (typeof host === 'string') {
    return parseSubdomainFromHost(host);
  }

  return null;
}

async function loadTenantBySubdomain(subdomain: string): Promise<Tenant | null> {
  return prisma.tenant.findFirst({
    where: { subdomain, isActive: true },
  });
}

async function loadDefaultTenant(): Promise<Tenant | null> {
  const configured = process.env.DEFAULT_TENANT_SUBDOMAIN?.trim().toLowerCase();
  if (configured) {
    const tenant = await loadTenantBySubdomain(configured);
    if (tenant) return tenant;
  }

  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  for (const subdomain of ['demo', 'demo-practice']) {
    const tenant = await loadTenantBySubdomain(subdomain);
    if (tenant) return tenant;
  }

  return null;
}

/**
 * Resolve tenant for the current request (used by middleware and tests).
 */
export async function resolveTenantForRequest(req: Request): Promise<Tenant | null> {
  const tenantIdHeader = req.headers['x-tenant-id'];
  if (typeof tenantIdHeader === 'string' && tenantIdHeader.trim()) {
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantIdHeader.trim(), isActive: true },
    });
    if (tenant) return tenant;
  }

  const subdomain = getSubdomainFromRequest(req);
  if (subdomain) {
    const tenant = await loadTenantBySubdomain(subdomain);
    if (tenant) return tenant;
  }

  return loadDefaultTenant();
}

export const extractTenant = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tenant = await resolveTenantForRequest(req);
    if (tenant) {
      req.tenantId = tenant.id;
      (req as Request & { tenant?: Tenant }).tenant = tenant;
    }
    next();
  } catch (error) {
    console.error('Tenant extraction error:', error);
    next();
  }
};

export const tenantHeader = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tenant = await resolveTenantForRequest(req);
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
    (req as Request & { tenant?: Tenant }).tenant = tenant;
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

export default { extractTenant, tenantHeader, validateTenantMembership, parseSubdomainFromHost, resolveTenantForRequest };
