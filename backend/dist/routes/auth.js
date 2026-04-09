"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const database_js_1 = require("../config/database.js");
const auth_js_1 = require("../middleware/auth.js");
const errorHandler_js_1 = require("../middleware/errorHandler.js");
// import { twoFactorService } from '../services/twoFactorService.js';
// import { passwordResetService } from '../services/passwordResetService.js';
const gdprService_js_1 = require("../services/gdprService.js");
const router = (0, express_1.Router)();
// Validation schemas
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(1, 'Password is required'),
    tenantId: zod_1.z.string().optional(), // Optional if using subdomain
});
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
    firstName: zod_1.z.string().min(1, 'First name is required'),
    lastName: zod_1.z.string().min(1, 'Last name is required'),
    tenantId: zod_1.z.string(),
});
const refreshTokenSchema = zod_1.z.object({
    refreshToken: zod_1.z.string(),
});
/**
 * POST /api/auth/login
 * Authenticate user and return tokens
 */
router.post('/login', (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { email, password, tenantId } = loginSchema.parse(req.body);
    // Determine tenant ID from subdomain, body, or look up user by email
    let resolvedTenantId = tenantId || req.tenantId;
    // If no tenant provided, try to find user by email only
    if (!resolvedTenantId) {
        const userByEmail = await database_js_1.prisma.user.findFirst({
            where: {
                email: email.toLowerCase(),
                isActive: true,
            },
            include: { tenant: true },
        });
        if (userByEmail) {
            resolvedTenantId = userByEmail.tenantId;
        }
    }
    if (!resolvedTenantId) {
        throw new errorHandler_js_1.ApiError('NO_TENANT', 'Tenant identifier is required', 400);
    }
    // Find user
    const user = await database_js_1.prisma.user.findFirst({
        where: {
            email: email.toLowerCase(),
            tenantId: resolvedTenantId,
            isActive: true,
        },
        include: {
            tenant: true,
        },
    });
    if (!user) {
        throw new errorHandler_js_1.ApiError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    // Verify password
    const isValidPassword = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!isValidPassword) {
        throw new errorHandler_js_1.ApiError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    // Update last login
    await database_js_1.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
    });
    // Generate tokens
    const accessToken = (0, auth_js_1.generateToken)({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
    });
    const refreshToken = await (0, auth_js_1.generateRefreshToken)(user.id);
    // Set HTTP-only cookies for security
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    // Set CSRF token cookie (required for state-changing requests)
    const csrfToken = (0, auth_js_1.generateCsrfToken)();
    res.cookie('csrfToken', csrfToken, {
        httpOnly: false, // Must be accessible by JavaScript
        secure: isProduction,
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
    res.json({
        success: true,
        data: {
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                tenant: {
                    id: user.tenant.id,
                    name: user.tenant.name,
                    subdomain: user.tenant.subdomain,
                    primaryColor: user.tenant.primaryColor,
                    settings: user.tenant.settings,
                },
            },
            // Tokens also returned for client-side storage fallback
            // but httpOnly cookies are the primary authentication method
            tokens: {
                accessToken,
                refreshToken,
                expiresIn: 86400, // 24 hours
            },
        },
    });
}));
/**
 * POST /api/auth/register
 * Register a new user (requires partner/admin approval)
 */
router.post('/register', (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { email, password, firstName, lastName, tenantId } = registerSchema.parse(req.body);
    // Check if user already exists
    const existingUser = await database_js_1.prisma.user.findFirst({
        where: {
            email: email.toLowerCase(),
            tenantId,
        },
    });
    if (existingUser) {
        throw new errorHandler_js_1.ApiError('USER_EXISTS', 'User already exists in this tenant', 409);
    }
    // Hash password
    const passwordHash = await bcryptjs_1.default.hash(password, 12);
    // Create user
    const user = await database_js_1.prisma.user.create({
        data: {
            email: email.toLowerCase(),
            passwordHash,
            firstName,
            lastName,
            tenantId,
            role: 'JUNIOR', // Default role
            isActive: true,
        },
        include: {
            tenant: true,
        },
    });
    // Generate tokens
    const accessToken = (0, auth_js_1.generateToken)({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
    });
    const refreshToken = await (0, auth_js_1.generateRefreshToken)(user.id);
    res.status(201).json({
        success: true,
        data: {
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                tenant: {
                    id: user.tenant.id,
                    name: user.tenant.name,
                    subdomain: user.tenant.subdomain,
                },
            },
            tokens: {
                accessToken,
                refreshToken,
                expiresIn: 86400,
            },
        },
    });
}));
/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post('/refresh', (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    // Find valid refresh token
    const tokenRecord = await database_js_1.prisma.refreshToken.findFirst({
        where: {
            token: refreshToken,
            expiresAt: { gt: new Date() },
        },
        include: {
            user: {
                include: {
                    tenant: true,
                },
            },
        },
    });
    if (!tokenRecord) {
        throw new errorHandler_js_1.ApiError('INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token', 401);
    }
    const user = tokenRecord.user;
    // Generate new access token
    const accessToken = (0, auth_js_1.generateToken)({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
    });
    // Generate new refresh token
    const newRefreshToken = await (0, auth_js_1.generateRefreshToken)(user.id);
    // Delete old refresh token
    await database_js_1.prisma.refreshToken.delete({
        where: { id: tokenRecord.id },
    });
    res.json({
        success: true,
        data: {
            tokens: {
                accessToken,
                refreshToken: newRefreshToken,
                expiresIn: 86400,
            },
        },
    });
}));
/**
 * POST /api/auth/logout
 * Logout user and invalidate tokens
 */
router.post('/logout', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
        await database_js_1.prisma.refreshToken.deleteMany({
            where: { token: refreshToken },
        });
    }
    // Clear HTTP-only cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    res.json({
        success: true,
        data: { message: 'Logged out successfully' },
    });
}));
/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const user = await database_js_1.prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
            tenant: true,
        },
    });
    if (!user) {
        throw new errorHandler_js_1.ApiError('USER_NOT_FOUND', 'User not found', 404);
    }
    res.json({
        success: true,
        data: {
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                isActive: user.isActive,
                lastLoginAt: user.lastLoginAt,
                tenant: {
                    id: user.tenant.id,
                    name: user.tenant.name,
                    subdomain: user.tenant.subdomain,
                    primaryColor: user.tenant.primaryColor,
                    settings: user.tenant.settings,
                },
            },
        },
    });
}));
/**
 * PUT /api/auth/change-password
 * Change user password
 */
router.put('/change-password', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { currentPassword, newPassword } = zod_1.z.object({
        currentPassword: zod_1.z.string(),
        newPassword: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
    }).parse(req.body);
    const user = await database_js_1.prisma.user.findUnique({
        where: { id: req.user.id },
    });
    if (!user) {
        throw new errorHandler_js_1.ApiError('USER_NOT_FOUND', 'User not found', 404);
    }
    // Verify current password
    const isValidPassword = await bcryptjs_1.default.compare(currentPassword, user.passwordHash);
    if (!isValidPassword) {
        throw new errorHandler_js_1.ApiError('INVALID_PASSWORD', 'Current password is incorrect', 400);
    }
    // Hash new password
    const newPasswordHash = await bcryptjs_1.default.hash(newPassword, 12);
    // Update password
    await database_js_1.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newPasswordHash },
    });
    // Invalidate all refresh tokens
    await database_js_1.prisma.refreshToken.deleteMany({
        where: { userId: user.id },
    });
    res.json({
        success: true,
        data: { message: 'Password changed successfully' },
    });
}));
/**
 * PUT /api/auth/me
 * Update current user profile
 */
router.put('/me', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const updateSchema = zod_1.z.object({
        firstName: zod_1.z.string().min(1, 'First name is required').optional(),
        lastName: zod_1.z.string().min(1, 'Last name is required').optional(),
        email: zod_1.z.string().email('Invalid email').optional(),
        phone: zod_1.z.string().optional(),
        jobTitle: zod_1.z.string().optional(),
    });
    const data = updateSchema.parse(req.body);
    // Check if email is being changed and if it's already in use
    if (data.email && data.email !== req.user.email) {
        const existingUser = await database_js_1.prisma.user.findFirst({
            where: {
                email: data.email.toLowerCase(),
                tenantId: req.tenantId,
                id: { not: req.user.id },
            },
        });
        if (existingUser) {
            throw new errorHandler_js_1.ApiError('EMAIL_EXISTS', 'Email is already in use', 409);
        }
    }
    const user = await database_js_1.prisma.user.update({
        where: { id: req.user.id },
        data: {
            ...data,
            email: data.email?.toLowerCase(),
        },
        include: {
            tenant: true,
        },
    });
    res.json({
        success: true,
        data: {
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                isActive: user.isActive,
                lastLoginAt: user.lastLoginAt,
                tenant: {
                    id: user.tenant.id,
                    name: user.tenant.name,
                    subdomain: user.tenant.subdomain,
                    primaryColor: user.tenant.primaryColor,
                    settings: user.tenant.settings,
                },
            },
        },
        message: 'Profile updated successfully',
    });
}));
/**
 * GET /api/auth/users
 * Get all users in tenant (admin/manager only)
 */
router.get('/users', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'PARTNER', 'MANAGER'), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const users = await database_js_1.prisma.user.findMany({
        where: {
            tenantId: req.tenantId,
            isActive: true,
        },
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
            lastLoginAt: true,
            createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
    });
    res.json({
        success: true,
        data: users,
    });
}));
/**
 * POST /api/auth/users
 * Create new user (admin/manager only)
 */
router.post('/users', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'PARTNER', 'MANAGER'), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const createUserSchema = zod_1.z.object({
        email: zod_1.z.string().email('Invalid email'),
        firstName: zod_1.z.string().min(1, 'First name is required'),
        lastName: zod_1.z.string().min(1, 'Last name is required'),
        role: zod_1.z.enum(['PARTNER', 'MANAGER', 'SENIOR', 'JUNIOR']),
        password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
    });
    const data = createUserSchema.parse(req.body);
    // Check if email already exists
    const existingUser = await database_js_1.prisma.user.findFirst({
        where: {
            email: data.email.toLowerCase(),
            tenantId: req.tenantId,
        },
    });
    if (existingUser) {
        throw new errorHandler_js_1.ApiError('EMAIL_EXISTS', 'User with this email already exists', 409);
    }
    // Hash password
    const passwordHash = await bcryptjs_1.default.hash(data.password, 12);
    const user = await database_js_1.prisma.user.create({
        data: {
            email: data.email.toLowerCase(),
            firstName: data.firstName,
            lastName: data.lastName,
            role: data.role,
            passwordHash,
            tenantId: req.tenantId,
            isActive: true,
        },
    });
    res.status(201).json({
        success: true,
        data: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            isActive: user.isActive,
        },
        message: 'User created successfully',
    });
}));
/**
 * PUT /api/auth/users/:id
 * Update user (admin/manager only)
 */
router.put('/users/:id', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'PARTNER', 'MANAGER'), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const updateUserSchema = zod_1.z.object({
        firstName: zod_1.z.string().min(1).optional(),
        lastName: zod_1.z.string().min(1).optional(),
        email: zod_1.z.string().email().optional(),
        role: zod_1.z.enum(['PARTNER', 'MANAGER', 'SENIOR', 'JUNIOR']).optional(),
        isActive: zod_1.z.boolean().optional(),
    });
    const data = updateUserSchema.parse(req.body);
    // Check if user exists in this tenant
    const existingUser = await database_js_1.prisma.user.findFirst({
        where: {
            id,
            tenantId: req.tenantId,
        },
    });
    if (!existingUser) {
        throw new errorHandler_js_1.ApiError('USER_NOT_FOUND', 'User not found', 404);
    }
    // Check email uniqueness if changing
    if (data.email && data.email !== existingUser.email) {
        const emailExists = await database_js_1.prisma.user.findFirst({
            where: {
                email: data.email.toLowerCase(),
                tenantId: req.tenantId,
                id: { not: id },
            },
        });
        if (emailExists) {
            throw new errorHandler_js_1.ApiError('EMAIL_EXISTS', 'Email is already in use', 409);
        }
    }
    const user = await database_js_1.prisma.user.update({
        where: { id },
        data: {
            ...data,
            email: data.email?.toLowerCase(),
        },
    });
    res.json({
        success: true,
        data: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            isActive: user.isActive,
        },
        message: 'User updated successfully',
    });
}));
/**
 * DELETE /api/auth/users/:id
 * Deactivate user (admin/manager only)
 */
router.delete('/users/:id', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'PARTNER', 'MANAGER'), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    // Prevent self-deactivation
    if (id === req.user.id) {
        throw new errorHandler_js_1.ApiError('CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account', 400);
    }
    const existingUser = await database_js_1.prisma.user.findFirst({
        where: {
            id,
            tenantId: req.tenantId,
        },
    });
    if (!existingUser) {
        throw new errorHandler_js_1.ApiError('USER_NOT_FOUND', 'User not found', 404);
    }
    await database_js_1.prisma.user.update({
        where: { id },
        data: { isActive: false },
    });
    res.json({
        success: true,
        data: { message: 'User deactivated successfully' },
    });
}));
// ============================================================================
// PASSWORD RESET - DISABLED (requires passwordReset model in schema)
// ============================================================================
/**
 * POST /api/auth/forgot-password
 * Request password reset email - DISABLED
 */
router.post('/forgot-password', (0, errorHandler_js_1.asyncHandler)(async (_req, res) => {
    res.status(501).json({
        success: false,
        error: { code: 'NOT_IMPLEMENTED', message: 'Password reset not implemented' },
    });
}));
/**
 * POST /api/auth/reset-password
 * Reset password with token - DISABLED
 */
router.post('/reset-password', (0, errorHandler_js_1.asyncHandler)(async (_req, res) => {
    res.status(501).json({
        success: false,
        error: { code: 'NOT_IMPLEMENTED', message: 'Password reset not implemented' },
    });
}));
// ============================================================================
// TWO-FACTOR AUTHENTICATION - DISABLED (requires 2FA models in schema)
// ============================================================================
/**
 * POST /api/auth/2fa/setup
 * Setup 2FA for user - DISABLED
 */
router.post('/2fa/setup', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (_req, res) => {
    res.status(501).json({
        success: false,
        error: { code: 'NOT_IMPLEMENTED', message: '2FA not implemented' },
    });
}));
/**
 * POST /api/auth/2fa/verify
 * Verify 2FA token and enable 2FA - DISABLED
 */
router.post('/2fa/verify', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (_req, res) => {
    res.status(501).json({
        success: false,
        error: { code: 'NOT_IMPLEMENTED', message: '2FA not implemented' },
    });
}));
/**
 * POST /api/auth/2fa/disable
 * Disable 2FA - DISABLED
 */
router.post('/2fa/disable', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (_req, res) => {
    res.status(501).json({
        success: false,
        error: { code: 'NOT_IMPLEMENTED', message: '2FA not implemented' },
    });
}));
// ============================================================================
// GDPR COMPLIANCE
// ============================================================================
/**
 * GET /api/auth/me/export
 * Export user data (GDPR Article 20)
 */
router.get('/me/export', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const exportData = await gdprService_js_1.gdprService.exportUserData(req.user.id, database_js_1.prisma);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="my-data-export.json"');
    res.json({
        success: true,
        data: exportData,
    });
}));
/**
 * DELETE /api/auth/me
 * Delete user account (GDPR Article 17)
 */
router.delete('/me', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { password, confirmDelete } = zod_1.z.object({
        password: zod_1.z.string(),
        confirmDelete: zod_1.z.literal(true),
    }).parse(req.body);
    const user = await database_js_1.prisma.user.findUnique({
        where: { id: req.user.id },
    });
    if (!user) {
        throw new errorHandler_js_1.ApiError('USER_NOT_FOUND', 'User not found', 404);
    }
    // Verify password
    const isValidPassword = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!isValidPassword) {
        throw new errorHandler_js_1.ApiError('INVALID_PASSWORD', 'Invalid password', 400);
    }
    // Anonymize user data
    const result = await gdprService_js_1.gdprService.deleteUserData(req.user.id, req.tenantId, database_js_1.prisma);
    // Clear cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    res.json({
        success: true,
        data: {
            message: 'Account deleted successfully',
            anonymizedId: result.anonymizedId,
        },
    });
}));
/**
 * GET /api/auth/csrf-token
 * Get CSRF token for cross-domain requests
 */
router.get('/csrf-token', (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const csrfToken = (0, auth_js_1.generateCsrfToken)();
    res.cookie('csrfToken', csrfToken, {
        httpOnly: false,
        secure: true,
        sameSite: 'none',
        maxAge: 24 * 60 * 60 * 1000,
    });
    res.json({
        success: true,
        data: { csrfToken },
    });
}));
exports.default = router;
//# sourceMappingURL=auth.js.map