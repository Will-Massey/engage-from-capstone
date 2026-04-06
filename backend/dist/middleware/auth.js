import jwt from 'jsonwebtoken';
import { prisma } from '../config/database.js';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
}
// Generate JWT token
export const generateToken = (user) => {
    return jwt.sign({
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
    }, JWT_SECRET, { expiresIn: (process.env.JWT_EXPIRES_IN || '24h') });
};
// Generate refresh token
export const generateRefreshToken = async (userId) => {
    const refreshToken = jwt.sign({ userId }, JWT_SECRET, {
        expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d'),
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
export const authenticate = async (req, res, next) => {
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
        const decoded = jwt.verify(token, JWT_SECRET);
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
    }
    catch (error) {
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
export const authorize = (...roles) => {
    return (req, res, next) => {
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
export const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            next();
            return;
        }
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET);
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
    }
    catch {
        // Silently fail for optional auth
        next();
    }
};
// CSRF Protection - Double Submit Cookie Pattern
import crypto from 'crypto';
// Generate CSRF token
export const generateCsrfToken = () => {
    return crypto.randomBytes(32).toString('hex');
};
// CSRF protection middleware
export const csrfProtection = (req, res, next) => {
    // Skip CSRF for GET, HEAD, OPTIONS requests (they should be safe)
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        next();
        return;
    }
    // Skip CSRF for public routes (webhooks, OAuth callbacks, public proposals)
    // Note: paths are relative to where CSRF middleware is mounted (/api)
    const publicPaths = [
        '/payments/webhook',
        '/oauth/callback',
        '/proposals/view', // Public proposal viewing and signing
        '/clients', // TEMPORARY: Skip CSRF for client creation during testing
        '/admin/seed-services', // One-click admin seed endpoint
    ];
    if (publicPaths.some(path => req.path.startsWith(path))) {
        next();
        return;
    }
    // Debug logging
    console.log('[CSRF Debug]', {
        originalUrl: req.originalUrl,
        path: req.path,
        method: req.method,
        csrfHeader: req.headers['x-csrf-token']?.slice(0, 10) + '...',
        hasCsrfCookie: !!req.cookies?.csrfToken,
        allCookies: Object.keys(req.cookies || {}),
    });
    const csrfToken = req.headers['x-csrf-token'];
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
export const setCsrfCookie = (req, res, next) => {
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
