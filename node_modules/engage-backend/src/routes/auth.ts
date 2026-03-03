import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { authenticate, generateToken, generateRefreshToken } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

const router = Router();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  tenantId: z.string().optional(), // Optional if using subdomain
});

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  tenantId: z.string(),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string(),
});

/**
 * POST /api/auth/login
 * Authenticate user and return tokens
 */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password, tenantId } = loginSchema.parse(req.body);

    // Determine tenant ID from subdomain or body
    const resolvedTenantId = tenantId || req.tenantId;

    if (!resolvedTenantId) {
      throw new ApiError('NO_TENANT', 'Tenant identifier is required', 400);
    }

    // Find user
    const user = await prisma.user.findFirst({
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
      throw new ApiError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
      throw new ApiError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate tokens
    const accessToken = generateToken({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenantId,
    });

    const refreshToken = await generateRefreshToken(user.id);

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
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: 86400, // 24 hours
        },
      },
    });
  })
);

/**
 * POST /api/auth/register
 * Register a new user (requires partner/admin approval)
 */
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { email, password, firstName, lastName, tenantId } = registerSchema.parse(req.body);

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        tenantId,
      },
    });

    if (existingUser) {
      throw new ApiError('USER_EXISTS', 'User already exists in this tenant', 409);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
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
    const accessToken = generateToken({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenantId,
    });

    const refreshToken = await generateRefreshToken(user.id);

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
  })
);

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = refreshTokenSchema.parse(req.body);

    // Find valid refresh token
    const tokenRecord = await prisma.refreshToken.findFirst({
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
      throw new ApiError('INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token', 401);
    }

    const user = tokenRecord.user;

    // Generate new access token
    const accessToken = generateToken({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenantId,
    });

    // Generate new refresh token
    const newRefreshToken = await generateRefreshToken(user.id);

    // Delete old refresh token
    await prisma.refreshToken.delete({
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
  })
);

/**
 * POST /api/auth/logout
 * Logout user and invalidate tokens
 */
router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { token: refreshToken },
      });
    }

    res.json({
      success: true,
      data: { message: 'Logged out successfully' },
    });
  })
);

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        tenant: true,
      },
    });

    if (!user) {
      throw new ApiError('USER_NOT_FOUND', 'User not found', 404);
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
  })
);

/**
 * PUT /api/auth/change-password
 * Change user password
 */
router.put(
  '/change-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    }).parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
    });

    if (!user) {
      throw new ApiError('USER_NOT_FOUND', 'User not found', 404);
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!isValidPassword) {
      throw new ApiError('INVALID_PASSWORD', 'Current password is incorrect', 400);
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    // Invalidate all refresh tokens
    await prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    });

    res.json({
      success: true,
      data: { message: 'Password changed successfully' },
    });
  })
);

export default router;
