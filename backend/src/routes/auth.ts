import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { authenticate, authorize, generateToken, generateRefreshToken } from '../middleware/auth.js';
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

    // Clear HTTP-only cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

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

/**
 * PUT /api/auth/me
 * Update current user profile
 */
router.put(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const updateSchema = z.object({
      firstName: z.string().min(1, 'First name is required').optional(),
      lastName: z.string().min(1, 'Last name is required').optional(),
      email: z.string().email('Invalid email').optional(),
      phone: z.string().optional(),
      jobTitle: z.string().optional(),
    });

    const data = updateSchema.parse(req.body);

    // Check if email is being changed and if it's already in use
    if (data.email && data.email !== req.user!.email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email: data.email.toLowerCase(),
          tenantId: req.tenantId,
          id: { not: req.user!.id },
        },
      });

      if (existingUser) {
        throw new ApiError('EMAIL_EXISTS', 'Email is already in use', 409);
      }
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
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
  })
);

/**
 * GET /api/auth/users
 * Get all users in tenant (admin/manager only)
 */
router.get(
  '/users',
  authenticate,
  authorize('PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({
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
  })
);

/**
 * POST /api/auth/users
 * Create new user (admin/manager only)
 */
router.post(
  '/users',
  authenticate,
  authorize('PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const createUserSchema = z.object({
      email: z.string().email('Invalid email'),
      firstName: z.string().min(1, 'First name is required'),
      lastName: z.string().min(1, 'Last name is required'),
      role: z.enum(['PARTNER', 'MANAGER', 'SENIOR', 'JUNIOR']),
      password: z.string().min(8, 'Password must be at least 8 characters'),
    });

    const data = createUserSchema.parse(req.body);

    // Check if email already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        email: data.email.toLowerCase(),
        tenantId: req.tenantId,
      },
    });

    if (existingUser) {
      throw new ApiError('EMAIL_EXISTS', 'User with this email already exists', 409);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        passwordHash,
        tenantId: req.tenantId!,
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
  })
);

/**
 * PUT /api/auth/users/:id
 * Update user (admin/manager only)
 */
router.put(
  '/users/:id',
  authenticate,
  authorize('PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const updateUserSchema = z.object({
      firstName: z.string().min(1).optional(),
      lastName: z.string().min(1).optional(),
      email: z.string().email().optional(),
      role: z.enum(['PARTNER', 'MANAGER', 'SENIOR', 'JUNIOR']).optional(),
      isActive: z.boolean().optional(),
    });

    const data = updateUserSchema.parse(req.body);

    // Check if user exists in this tenant
    const existingUser = await prisma.user.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!existingUser) {
      throw new ApiError('USER_NOT_FOUND', 'User not found', 404);
    }

    // Check email uniqueness if changing
    if (data.email && data.email !== existingUser.email) {
      const emailExists = await prisma.user.findFirst({
        where: {
          email: data.email.toLowerCase(),
          tenantId: req.tenantId,
          id: { not: id },
        },
      });

      if (emailExists) {
        throw new ApiError('EMAIL_EXISTS', 'Email is already in use', 409);
      }
    }

    const user = await prisma.user.update({
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
  })
);

/**
 * DELETE /api/auth/users/:id
 * Deactivate user (admin/manager only)
 */
router.delete(
  '/users/:id',
  authenticate,
  authorize('PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Prevent self-deactivation
    if (id === req.user!.id) {
      throw new ApiError('CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account', 400);
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!existingUser) {
      throw new ApiError('USER_NOT_FOUND', 'User not found', 404);
    }

    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    res.json({
      success: true,
      data: { message: 'User deactivated successfully' },
    });
  })
);

export default router;
