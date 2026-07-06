/**
 * Password Reset Service
 * Secure token-based password reset functionality
 */

import crypto from 'crypto';
import { validatePasswordStrength } from '../utils/passwordPolicy.js';

export interface PasswordResetToken {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

export class PasswordResetService {
  /**
   * Generate a secure password reset token
   */
  generateToken(): PasswordResetToken {
    // Generate 32 bytes of random data
    const token = crypto.randomBytes(32).toString('hex');

    // Create hash for storage
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Token expires in 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

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
   * Generate a cryptographically secure password
   */
  generateSecurePassword(length: number = 16): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    const bytes = crypto.randomBytes(length);
    let password = '';

    for (let i = 0; i < length; i++) {
      password += charset[bytes[i] % charset.length];
    }

    return password;
  }

  /**
   * Validate password strength — delegates to the shared policy so all flows
   * (registration, invite, change, reset) enforce the same rules.
   */
  validatePasswordStrength(password: string): {
    isValid: boolean;
    errors: string[];
  } {
    return validatePasswordStrength(password);
  }
}

export const passwordResetService = new PasswordResetService();
export default passwordResetService;
