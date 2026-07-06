import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../config/database.js';
import { UserRole } from '@prisma/client';
import { hasFullAccess } from '../constants/roles.js';
import {
  isCsrfTokenRegistered,
  isCsrfTokenRegisteredAsync,
  registerCsrfToken,
} from '../utils/csrfStore.js';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

if (process.env.NODE_ENV === 'production' && !process.env.JWT_REFRESH_SECRET) {
  throw new Error('JWT_REFRESH_SECRET environment variable is required in production');
}

// Extended request type with user and tenant
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: UserRole;
        tenantId: string;
      };
      tenantId: string;
    }
  }
}

interface JWTPayload {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  tenantId: string;
  iat: number;
  exp: number;
}

// Generate JWT token
export const generateToken = (user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  tenantId: string;
}): string => {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenantId,
    },
    JWT_SECRET,
    { expiresIn: (process.env.JWT_EXPIRES_IN || '24h') as jwt.SignOptions['expiresIn'] }
  );
};

export function verifyRefreshToken(token: string): { userId: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as { userId?: string; purpose?: string };
    if (!decoded.userId || decoded.purpose !== 'refresh') {
      return null;
    }
    return { userId: decoded.userId };
  } catch {
    return null;
  }
}

// Generate refresh token
export const generateRefreshToken = async (userId: string): Promise<string> => {
  const refreshToken = jwt.sign({ userId, purpose: 'refresh' }, JWT_REFRESH_SECRET, {
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'],
  });

  // Store refresh token in database
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId,
      expiresAt,
    },
  });

  return refreshToken;
};

// Verify JWT token middleware
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    let token: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access token is required',
        },
      });
      return;
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

    // Check if user still exists and is active
    const user = await prisma.user.findFirst({
      where: {
        id: decoded.userId,
        tenantId: decoded.tenantId,
        isActive: true,
      },
    });

    if (!user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not found or inactive',
        },
      });
      return;
    }

    // Reject cross-tenant header injection (X-Tenant-Id must match JWT tenant)
    const headerTenantId = req.headers['x-tenant-id'];
    if (
      typeof headerTenantId === 'string' &&
      headerTenantId.trim() &&
      headerTenantId.trim() !== user.tenantId
    ) {
      res.status(403).json({
        success: false,
        error: {
          code: 'TENANT_MISMATCH',
          message: 'User does not belong to this tenant',
        },
      });
      return;
    }

    // Attach user and tenant to request
    req.user = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenantId,
    };
    req.tenantId = user.tenantId;

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Access token has expired',
        },
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid access token',
        },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication failed',
      },
    });
  }
};

// Role-based authorization middleware
export const authorize = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
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

    // Managing Director has full tenant access (settings, AI, templates, automation, etc.)
    if (!hasFullAccess(req.user.role) && !roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
        },
      });
      return;
    }

    next();
  };
};

// Optional authentication (for public routes that can be enhanced with auth)
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

    const user = await prisma.user.findFirst({
      where: {
        id: decoded.userId,
        tenantId: decoded.tenantId,
        isActive: true,
      },
    });

    if (user) {
      req.user = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
      };
      req.tenantId = user.tenantId;
    }

    next();
  } catch {
    // Silently fail for optional auth
    next();
  }
};

// CSRF Protection - Double Submit Cookie Pattern

// Generate CSRF token
export const generateCsrfToken = (): string => {
  const token = crypto.randomBytes(32).toString('hex');
  registerCsrfToken(token);
  return token;
};

// CSRF protection middleware
export const csrfProtection = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Skip CSRF for GET, HEAD, OPTIONS requests (they should be safe)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  // Skip CSRF for unauthenticated auth routes and public endpoints
  // Note: paths are relative to where CSRF middleware is mounted (/api)
  const publicPaths = [
    '/auth/login',
    '/auth/register',
    '/auth/csrf-token',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/auth/2fa/login',
    '/payments/webhook',
    '/billing/webhook', // Revolut Merchant API (HMAC-verified)
    '/oauth/callback',
    '/proposals/view', // Public proposal viewing and signing
    '/proposals/portal', // Client portal (public access)
    '/onboarding', // AML self-service form (public, portal token)
    '/webhooks/sendgrid', // SendGrid delivery events
    '/webhooks/cloudflare-email', // Cloudflare delivery events
    '/aml/webhook', // AML partner results webhook
    '/admin/seed-services', // One-click admin seed endpoint
    '/automation/migrate-service-pricing', // Data migration endpoint (protected by secret key)
    '/setup', // ops setup (migrate-pricing, seed-tenant-library, clear-login-lockout)
  ];
  if (publicPaths.some((path) => req.path.startsWith(path))) {
    next();
    return;
  }

  const csrfToken = req.headers['x-csrf-token'] as string;
  const csrfCookie = req.cookies?.csrfToken;

  if (!csrfToken) {
    res.status(403).json({
      success: false,
      error: {
        code: 'CSRF_MISSING',
        message: 'CSRF token missing from request header',
      },
    });
    return;
  }

  // Same-site: header must match cookie
  if (csrfCookie && csrfToken !== csrfCookie) {
    res.status(403).json({
      success: false,
      error: {
        code: 'CSRF_INVALID',
        message: 'CSRF token validation failed',
      },
    });
    return;
  }

  // Cross-domain: cookie may be absent — token must be server-registered at login/csrf-token
  if (!csrfCookie) {
    const registered =
      isCsrfTokenRegistered(csrfToken) || (await isCsrfTokenRegisteredAsync(csrfToken));
    if (!registered) {
      res.status(403).json({
        success: false,
        error: {
          code: 'CSRF_INVALID',
          message: 'CSRF token validation failed',
        },
      });
      return;
    }
  }

  next();
};

// Set CSRF cookie middleware
export const setCsrfCookie = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.cookies?.csrfToken) {
    const csrfToken = generateCsrfToken();
    registerCsrfToken(csrfToken);
    const cookiePath = process.env.AUTH_COOKIE_PATH || '/';
    const sameOrigin =
      process.env.NODE_ENV === 'production' &&
      (cookiePath !== '/' || process.env.FRONTEND_URL?.includes('/engage'));
    res.cookie('csrfToken', csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: sameOrigin ? 'lax' : process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: cookiePath,
      maxAge: 24 * 60 * 60 * 1000,
    });
  }
  next();
};

export default {
  authenticate,
  authorize,
  optionalAuth,
  generateToken,
  generateRefreshToken,
  csrfProtection,
  setCsrfCookie,
};
