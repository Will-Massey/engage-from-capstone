import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database.js';
import { UserRole } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Extended request type with user and tenant
declare global {
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

// Generate refresh token
export const generateRefreshToken = async (userId: string): Promise<string> => {
  const refreshToken = jwt.sign({ userId }, JWT_SECRET, {
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

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access token is required',
        },
      });
      return;
    }

    const token = authHeader.substring(7);

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

    if (!roles.includes(req.user.role)) {
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
import crypto from 'crypto';

// Generate CSRF token
export const generateCsrfToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

// CSRF protection middleware
export const csrfProtection = (req: Request, res: Response, next: NextFunction): void => {
  // Skip CSRF for GET, HEAD, OPTIONS requests (they should be safe)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  // Skip CSRF for public routes (webhooks, OAuth callbacks, public proposals)
  const publicPaths = [
    '/api/payments/webhook',
    '/api/oauth/callback',
    '/api/proposals/view', // Public proposal viewing and signing
  ];
  if (publicPaths.some(path => req.path.startsWith(path))) {
    next();
    return;
  }

  const csrfToken = req.headers['x-csrf-token'] as string;
  const csrfCookie = req.cookies?.csrfToken;

  if (!csrfToken || !csrfCookie || csrfToken !== csrfCookie) {
    res.status(403).json({
      success: false,
      error: {
        code: 'CSRF_INVALID',
        message: 'CSRF token validation failed',
      },
    });
    return;
  }

  next();
};

// Set CSRF cookie middleware
export const setCsrfCookie = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.cookies?.csrfToken) {
    const csrfToken = generateCsrfToken();
    res.cookie('csrfToken', csrfToken, {
      httpOnly: false, // Must be accessible by JavaScript
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
  }
  next();
};

export default { authenticate, authorize, optionalAuth, generateToken, generateRefreshToken, csrfProtection, setCsrfCookie };
