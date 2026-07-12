/**
 * Email Verification Service
 * Secure token-based email verification for public signup paths.
 * Mirrors the PasswordReset token pattern (random token, sha256 hash at rest,
 * single-use, one outstanding token per user) with a 24-hour TTL.
 */

import crypto from 'crypto';
import { prisma } from '../config/database.js';
import { tenantMailerSend } from './tenantMailer.js';
import logger from '../config/logger.js';

export interface EmailVerificationToken {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

export class EmailVerificationService {
  /**
   * Generate a secure email verification token (24-hour expiry)
   */
  generateToken(): EmailVerificationToken {
    // Generate 32 bytes of random data
    const token = crypto.randomBytes(32).toString('hex');

    // Create hash for storage
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Token expires in 24 hours
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    return {
      token,
      tokenHash,
      expiresAt,
    };
  }

  /**
   * Hash a token for comparison
   */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Issue a fresh verification token for a user (deleteMany-then-create so
   * exactly one token is outstanding) and email them the verification link.
   */
  async sendVerificationEmail(
    user: { id: string; email: string; firstName: string; tenantId: string },
    tenantName?: string
  ): Promise<void> {
    const { token, tokenHash, expiresAt } = this.generateToken();

    await prisma.emailVerification.deleteMany({
      where: { userId: user.id },
    });

    await prisma.emailVerification.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    const verifyUrl = `${frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;
    const practiceName = tenantName || 'your practice';

    const result = await tenantMailerSend({
      tenantId: user.tenantId,
      messageType: 'OTHER',
      message: {
        to: user.email,
        subject: 'Verify your email — Engage by Capstone',
        text:
          `Hello ${user.firstName},\n\n` +
          `Welcome to Engage! Please verify the email address for your account at ${practiceName}.\n\n` +
          `Verify your email using this link (valid for 24 hours):\n${verifyUrl}\n\n` +
          `You won't be able to sign in until your email is verified.\n\n` +
          `If you did not create this account, you can safely ignore this email.\n\n` +
          `Engage by Capstone`,
        html:
          `<p>Hello ${user.firstName},</p>` +
          `<p>Welcome to Engage! Please verify the email address for your account at <strong>${practiceName}</strong>.</p>` +
          `<p><a href="${verifyUrl}">Verify your email</a> (link valid for 24 hours).</p>` +
          `<p>You won&apos;t be able to sign in until your email is verified.</p>` +
          `<p>If you did not create this account, you can safely ignore this email.</p>` +
          `<p>Engage by Capstone</p>`,
      },
    });

    if (!result.success) {
      logger.warn(
        `Verification email failed for ${user.email}: ${result.error || 'unknown error'}`
      );
    }
  }
}

export const emailVerificationService = new EmailVerificationService();
export default emailVerificationService;
