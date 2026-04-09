"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setCsrfCookie = exports.csrfProtection = exports.generateCsrfToken = exports.optionalAuth = exports.authorize = exports.authenticate = exports.generateRefreshToken = exports.generateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_js_1 = require("../config/database.js");
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
}
// Generate JWT token
const generateToken = (user) => {
    return jsonwebtoken_1.default.sign({
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
    }, JWT_SECRET, { expiresIn: (process.env.JWT_EXPIRES_IN || '24h') });
};
exports.generateToken = generateToken;
// Generate refresh token
const generateRefreshToken = async (userId) => {
    const refreshToken = jsonwebtoken_1.default.sign({ userId }, JWT_SECRET, {
        expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d'),
    });
    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await database_js_1.prisma.refreshToken.create({
        data: {
            token: refreshToken,
            userId,
            expiresAt,
        },
    });
    return refreshToken;
};
exports.generateRefreshToken = generateRefreshToken;
// Verify JWT token middleware
const authenticate = async (req, res, next) => {
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
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        // Check if user still exists and is active
        const user = await database_js_1.prisma.user.findFirst({
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
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            res.status(401).json({
                success: false,
                error: {
                    code: 'TOKEN_EXPIRED',
                    message: 'Access token has expired',
                },
            });
            return;
        }
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
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
exports.authenticate = authenticate;
// Role-based authorization middleware
const authorize = (...roles) => {
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
exports.authorize = authorize;
// Optional authentication (for public routes that can be enhanced with auth)
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            next();
            return;
        }
        const token = authHeader.substring(7);
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const user = await database_js_1.prisma.user.findFirst({
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
exports.optionalAuth = optionalAuth;
// CSRF Protection - Double Submit Cookie Pattern
const crypto_1 = __importDefault(require("crypto"));
// Generate CSRF token
const generateCsrfToken = () => {
    return crypto_1.default.randomBytes(32).toString('hex');
};
exports.generateCsrfToken = generateCsrfToken;
// CSRF protection middleware
const csrfProtection = (req, res, next) => {
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
exports.csrfProtection = csrfProtection;
// Set CSRF cookie middleware
const setCsrfCookie = (req, res, next) => {
    if (!req.cookies?.csrfToken) {
        const csrfToken = (0, exports.generateCsrfToken)();
        res.cookie('csrfToken', csrfToken, {
            httpOnly: false, // Must be accessible by JavaScript
            secure: true,
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
        });
    }
    next();
};
exports.setCsrfCookie = setCsrfCookie;
exports.default = { authenticate: exports.authenticate, authorize: exports.authorize, optionalAuth: exports.optionalAuth, generateToken: exports.generateToken, generateRefreshToken: exports.generateRefreshToken, csrfProtection: exports.csrfProtection, setCsrfCookie: exports.setCsrfCookie };
//# sourceMappingURL=auth.js.map