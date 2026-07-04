import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import {
  authenticate,
  authorize,
  generateToken,
  generateRefreshToken,
  generateCsrfToken,
  verifyRefreshToken,
} from '../middleware/auth.js';
import { registerCsrfToken } from '../utils/csrfStore.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { allowPublicRegister } from '../utils/securityFlags.js';
import logger from '../config/logger.js';
import {
  isLoginLocked,
  recordFailedLogin,
  clearLoginAttempts,
  LOGIN_LOCKOUT_MAX,
} from '../utils/loginLockout.js';
import { twoFactorService } from '../services/twoFactorService.js';
import { passwordResetService } from '../services/passwordResetService.js';
import { enforceTierLimit } from '../middleware/tierLimits.js';
import { gdprService } from '../services/gdprService.js';
import { createEmailService } from '../services/emailService.js';
import { setAuthCookies, clearAuthCookies, issueCsrfToken } from '../utils/authCookies.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET!;

type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  jobTitle: string | null;
  role: string;
  tenantId: string;
  twoFactorEnabled: boolean;
  tenant: {
    id: string;
    name: string;
    subdomain: string;
    primaryColor: string | null;
    settings: unknown;
  };
};

async function issueAuthSession(
  res: import('express').Response,
  user: AuthUser,
  options?: { rememberMe?: boolean }
): Promise<void> {
  const accessToken = generateToken({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role as import('@prisma/client').UserRole,
    tenantId: user.tenantId,
  });

  const refreshToken = await generateRefreshToken(user.id);
  const { csrfToken } = setAuthCookies(res, accessToken, refreshToken, options);

  res.json({
    success: true,
    data: {
      csrfToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        jobTitle: user.jobTitle,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
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
}

function frontendBaseUrl(): string {
  return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

// Validation schemas
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  tenantId: z.string().optional(), // Optional if using subdomain
  rememberMe: z.boolean().optional(),
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
    const { email, password, tenantId, rememberMe } = loginSchema.parse(req.body);

    logger.info(`Login attempt for: ${email}`, { tenantId, hasReqTenantId: !!req.tenantId });

    // Determine tenant ID from subdomain, body, or look up user by email
    let resolvedTenantId = tenantId || req.tenantId;

    // If no tenant provided, try to find user by email only
    if (!resolvedTenantId) {
      const userByEmail = await prisma.user.findFirst({
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
      logger.warn(`Login failed: No tenant ID for ${email}`);
      throw new ApiError('NO_TENANT', 'Tenant identifier is required', 400);
    }

    if (await isLoginLocked(email, resolvedTenantId)) {
      throw new ApiError(
        'ACCOUNT_LOCKED',
        'Too many failed login attempts. Please try again in 30 minutes.',
        429
      );
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
      logger.warn(`Login failed: User not found - ${email} in tenant ${resolvedTenantId}`);
      throw new ApiError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
      logger.warn(`Login failed: Invalid password for ${email}`);
      const attempts = await recordFailedLogin(email, resolvedTenantId);
      const remaining = Math.max(0, LOGIN_LOCKOUT_MAX - attempts);
      throw new ApiError(
        'INVALID_CREDENTIALS',
        remaining > 0
          ? `Invalid email or password (${remaining} attempt${remaining === 1 ? '' : 's'} remaining)`
          : 'Invalid email or password',
        401
      );
    }

    await clearLoginAttempts(email, resolvedTenantId);

    if (user.twoFactorEnabled && user.twoFactorSecret) {
      const pendingToken = jwt.sign(
        { userId: user.id, purpose: '2fa_pending' },
        JWT_SECRET,
        { expiresIn: '5m' }
      );

      logger.info(`Login requires 2FA: ${email} (${user.id})`);

      res.json({
        success: true,
        data: {
          requires2FA: true,
          pendingToken,
        },
      });
      return;
    }

    logger.info(`Login successful: ${email} (${user.id})`);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await issueAuthSession(res, user, { rememberMe: rememberMe === true });
  })
);

/**
 * POST /api/auth/register
 * Register a new user (requires partner/admin approval)
 */
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    if (!allowPublicRegister) {
      throw new ApiError(
        'REGISTRATION_DISABLED',
        'Public registration is disabled. Contact your practice administrator.',
        403
      );
    }

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

    const { csrfToken } = setAuthCookies(res, accessToken, refreshToken);

    res.status(201).json({
      success: true,
      data: {
        csrfToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          jobTitle: user.jobTitle,
          role: user.role,
          tenant: {
            id: user.tenant.id,
            name: user.tenant.name,
            subdomain: user.tenant.subdomain,
          },
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
    const refreshFromCookie = req.cookies?.refreshToken;
    const refreshFromBody = req.body?.refreshToken;
    const refreshToken = refreshFromBody || refreshFromCookie;

    if (!refreshToken) {
      throw new ApiError('INVALID_REFRESH_TOKEN', 'Refresh token is required', 401);
    }

    const refreshPayload = verifyRefreshToken(refreshToken);
    if (!refreshPayload) {
      throw new ApiError('INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token', 401);
    }

    const tokenRecord = await prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        userId: refreshPayload.userId,
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

    const { csrfToken } = setAuthCookies(res, accessToken, newRefreshToken);

    res.json({
      success: true,
      data: {
        message: 'Session refreshed',
        csrfToken,
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
    const refreshFromCookie = req.cookies?.refreshToken;
    const { refreshToken: refreshFromBody } = req.body || {};
    const refreshToken = refreshFromBody || refreshFromCookie;

    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { token: refreshToken },
      });
    } else if (req.user?.id) {
      await prisma.refreshToken.deleteMany({
        where: { userId: req.user.id },
      });
    }

    clearAuthCookies(res);

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

    const csrfToken = issueCsrfToken(res);

    res.json({
      success: true,
      data: {
        csrfToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          jobTitle: user.jobTitle,
          role: user.role,
          isActive: user.isActive,
          lastLoginAt: user.lastLoginAt,
          twoFactorEnabled: user.twoFactorEnabled,
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
    const { currentPassword, newPassword } = z
      .object({
        currentPassword: z.string(),
        newPassword: z.string().min(8, 'Password must be at least 8 characters'),
      })
      .parse(req.body);

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
      jobTitle: z.string().nullable().optional(),
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
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email?.toLowerCase(),
        phone: data.phone,
        jobTitle: data.jobTitle,
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
          phone: user.phone,
          jobTitle: user.jobTitle,
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
  authorize('ADMIN', 'PARTNER', 'MD', 'MANAGER'),
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
        phone: true,
        jobTitle: true,
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
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  enforceTierLimit('users'),
  asyncHandler(async (req, res) => {
    const createUserSchema = z.object({
      email: z.string().email('Invalid email'),
      firstName: z.string().min(1, 'First name is required'),
      lastName: z.string().min(1, 'Last name is required'),
      phone: z.string().optional(),
      jobTitle: z.string().optional(),
      role: z.enum(['PARTNER', 'MD', 'MANAGER', 'SENIOR', 'JUNIOR']),
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
        phone: data.phone,
        jobTitle: data.jobTitle,
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
        phone: user.phone,
        jobTitle: user.jobTitle,
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
  authorize('ADMIN', 'PARTNER', 'MD', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const updateUserSchema = z.object({
      firstName: z.string().min(1).optional(),
      lastName: z.string().min(1).optional(),
      email: z.string().email().optional(),
      phone: z.string().nullable().optional(),
      jobTitle: z.string().nullable().optional(),
      role: z.enum(['ADMIN', 'PARTNER', 'MD', 'MANAGER', 'SENIOR', 'JUNIOR']).optional(),
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
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email?.toLowerCase(),
        phone: data.phone,
        jobTitle: data.jobTitle,
        role: data.role,
        isActive: data.isActive,
      },
    });

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        jobTitle: user.jobTitle,
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
  authorize('ADMIN', 'PARTNER', 'MD', 'MANAGER'),
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

// ============================================================================
// PASSWORD RESET
// ============================================================================

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

/**
 * POST /api/auth/forgot-password
 * Request password reset email
 */
router.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const { email } = forgotPasswordSchema.parse(req.body);

    const user = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        isActive: true,
      },
      include: { tenant: true },
    });

    if (user) {
      const { token, tokenHash, expiresAt } = passwordResetService.generateToken();

      await prisma.passwordReset.deleteMany({
        where: { userId: user.id },
      });

      await prisma.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      const emailService = createEmailService();
      if (emailService) {
        const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(
          /\/$/,
          ''
        );
        const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
        const practiceName = user.tenant?.name || 'your practice';

        await emailService.sendEmail({
          to: user.email,
          subject: 'Reset your Engage password',
          text:
            `Hello ${user.firstName},\n\n` +
            `We received a request to reset the password for your Engage account at ${practiceName}.\n\n` +
            `Reset your password using this link (valid for 15 minutes):\n${resetUrl}\n\n` +
            `If you did not request this, you can safely ignore this email.\n\n` +
            `Engage by Capstone`,
          html:
            `<p>Hello ${user.firstName},</p>` +
            `<p>We received a request to reset the password for your Engage account at <strong>${practiceName}</strong>.</p>` +
            `<p><a href="${resetUrl}">Reset your password</a> (link valid for 15 minutes).</p>` +
            `<p>If you did not request this, you can safely ignore this email.</p>` +
            `<p>Engage by Capstone</p>`,
        });
      } else {
        logger.warn('Password reset requested but EMAIL_PROVIDER is not configured');
      }
    }

    res.json({
      success: true,
      data: {
        message: 'If an account exists for that email, reset instructions have been sent.',
      },
    });
  })
);

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
router.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);

    const strength = passwordResetService.validatePasswordStrength(newPassword);
    if (!strength.isValid) {
      throw new ApiError('WEAK_PASSWORD', strength.errors.join('. '), 400);
    }

    const tokenHash = passwordResetService.hashToken(token);
    const resetRecord = await prisma.passwordReset.findFirst({
      where: {
        tokenHash,
        expiresAt: { gt: new Date() },
        usedAt: null,
      },
      include: { user: true },
    });

    if (!resetRecord) {
      throw new ApiError(
        'INVALID_RESET_TOKEN',
        'This password reset link is invalid or has expired.',
        400
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash },
      }),
      prisma.passwordReset.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      }),
      prisma.refreshToken.deleteMany({
        where: { userId: resetRecord.userId },
      }),
    ]);

    res.json({
      success: true,
      data: { message: 'Password reset successfully. You can now sign in.' },
    });
  })
);

// ============================================================================
// TWO-FACTOR AUTHENTICATION
// ============================================================================

const twoFactorVerifySchema = z.object({
  token: z.string().min(6, 'Verification code is required'),
});

const twoFactorDisableSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

const twoFactorLoginSchema = z.object({
  pendingToken: z.string().min(1, '2FA session token is required'),
  totpToken: z.string().min(6, 'Verification code is required'),
});

/**
 * POST /api/auth/2fa/login
 * Complete login after password verification when 2FA is enabled
 */
router.post(
  '/2fa/login',
  asyncHandler(async (req, res) => {
    const { pendingToken, totpToken } = twoFactorLoginSchema.parse(req.body);

    let decoded: { userId: string; purpose?: string };
    try {
      decoded = jwt.verify(pendingToken, JWT_SECRET) as { userId: string; purpose?: string };
    } catch {
      throw new ApiError('INVALID_2FA_SESSION', '2FA session expired. Please sign in again.', 401);
    }

    if (decoded.purpose !== '2fa_pending') {
      throw new ApiError('INVALID_2FA_SESSION', 'Invalid 2FA session', 401);
    }

    const user = await prisma.user.findFirst({
      where: {
        id: decoded.userId,
        isActive: true,
        deletedAt: null,
        twoFactorEnabled: true,
      },
      include: { tenant: true },
    });

    if (!user || !user.twoFactorSecret) {
      throw new ApiError('INVALID_2FA_SESSION', '2FA session expired. Please sign in again.', 401);
    }

    const secret = twoFactorService.decryptSecret(user.twoFactorSecret);
    let verified = twoFactorService.verifyToken(secret, totpToken);

    if (!verified) {
      const backupCode = await prisma.twoFactorBackupCode.findFirst({
        where: {
          userId: user.id,
          codeHash: twoFactorService.hashBackupCode(totpToken),
          usedAt: null,
        },
      });

      if (backupCode) {
        await prisma.twoFactorBackupCode.update({
          where: { id: backupCode.id },
          data: { usedAt: new Date() },
        });
        verified = true;
      }
    }

    if (!verified) {
      throw new ApiError('INVALID_2FA_TOKEN', 'Invalid verification code', 401);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    logger.info(`2FA login successful: ${user.email} (${user.id})`);
    await issueAuthSession(res, user);
  })
);

/**
 * POST /api/auth/2fa/setup
 * Setup 2FA for user — returns QR code and backup codes
 */
router.post(
  '/2fa/setup',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
    });

    if (!user || user.deletedAt) {
      throw new ApiError('USER_NOT_FOUND', 'User not found', 404);
    }

    if (user.twoFactorEnabled) {
      throw new ApiError('2FA_ALREADY_ENABLED', 'Two-factor authentication is already enabled', 400);
    }

    const setup = await twoFactorService.generateSecret(user.id, user.email);
    const encryptedSecret = twoFactorService.encryptSecret(setup.secret);

    await prisma.$transaction([
      prisma.twoFactorBackupCode.deleteMany({ where: { userId: user.id } }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorSecret: encryptedSecret,
          twoFactorEnabled: false,
        },
      }),
      ...setup.backupCodes.map((code) =>
        prisma.twoFactorBackupCode.create({
          data: {
            userId: user.id,
            codeHash: twoFactorService.hashBackupCode(code),
          },
        })
      ),
    ]);

    res.json({
      success: true,
      data: {
        qrCodeUrl: setup.qrCodeUrl,
        backupCodes: setup.backupCodes,
      },
    });
  })
);

/**
 * POST /api/auth/2fa/verify
 * Verify 2FA token and enable 2FA
 */
router.post(
  '/2fa/verify',
  authenticate,
  asyncHandler(async (req, res) => {
    const { token } = twoFactorVerifySchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
    });

    if (!user || user.deletedAt) {
      throw new ApiError('USER_NOT_FOUND', 'User not found', 404);
    }

    if (user.twoFactorEnabled) {
      throw new ApiError('2FA_ALREADY_ENABLED', 'Two-factor authentication is already enabled', 400);
    }

    if (!user.twoFactorSecret) {
      throw new ApiError('2FA_NOT_SETUP', 'Please set up two-factor authentication first', 400);
    }

    const secret = twoFactorService.decryptSecret(user.twoFactorSecret);
    const isValid = twoFactorService.verifyToken(secret, token);

    if (!isValid) {
      throw new ApiError('INVALID_2FA_TOKEN', 'Invalid verification code', 400);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true },
    });

    logger.info('2FA enabled', { userId: user.id });

    res.json({
      success: true,
      data: { message: 'Two-factor authentication enabled successfully', twoFactorEnabled: true },
    });
  })
);

/**
 * POST /api/auth/2fa/disable
 * Disable 2FA
 */
router.post(
  '/2fa/disable',
  authenticate,
  asyncHandler(async (req, res) => {
    const { password } = twoFactorDisableSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
    });

    if (!user || user.deletedAt) {
      throw new ApiError('USER_NOT_FOUND', 'User not found', 404);
    }

    if (!user.twoFactorEnabled) {
      throw new ApiError('2FA_NOT_ENABLED', 'Two-factor authentication is not enabled', 400);
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new ApiError('INVALID_PASSWORD', 'Password is incorrect', 400);
    }

    await prisma.$transaction([
      prisma.twoFactorBackupCode.deleteMany({ where: { userId: user.id } }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
        },
      }),
    ]);

    logger.info('2FA disabled', { userId: user.id });

    res.json({
      success: true,
      data: { message: 'Two-factor authentication disabled', twoFactorEnabled: false },
    });
  })
);

// ============================================================================
// GDPR COMPLIANCE
// ============================================================================

/**
 * GET /api/auth/me/export
 * Export user data (GDPR Article 20)
 */
router.get(
  '/me/export',
  authenticate,
  asyncHandler(async (req, res) => {
    const exportData = await gdprService.exportUserData(req.user!.id, prisma);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="my-data-export.json"');
    res.json({
      success: true,
      data: exportData,
    });
  })
);

/**
 * GET /api/auth/me/audit-export
 * SOC2-style audit trail export (PARTNER/MANAGER only)
 */
router.get(
  '/me/audit-export',
  authenticate,
  authorize('PARTNER', 'MANAGER', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const exportData = await gdprService.exportTenantAudit(req.tenantId!, prisma);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="engage-audit-export.json"');
    res.json({ success: true, data: exportData });
  }),
);

/**
 * DELETE /api/auth/me
 * Delete user account (GDPR Article 17)
 */
router.delete(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const { password, confirmDelete } = z
      .object({
        password: z.string(),
        confirmDelete: z.literal(true),
      })
      .parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
    });

    if (!user) {
      throw new ApiError('USER_NOT_FOUND', 'User not found', 404);
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new ApiError('INVALID_PASSWORD', 'Invalid password', 400);
    }

    // Anonymize user data
    const result = await gdprService.deleteUserData(req.user!.id, req.tenantId!, prisma);

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
  })
);

/**
 * GET /api/auth/csrf-token
 * Get CSRF token for cross-domain requests
 */
router.get(
  '/csrf-token',
  authenticate,
  asyncHandler(async (req, res) => {
    const csrfToken = generateCsrfToken();
    registerCsrfToken(csrfToken);
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
  })
);

export default router;
