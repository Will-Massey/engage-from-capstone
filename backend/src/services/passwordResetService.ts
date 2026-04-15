/**
 * Password Reset Service
 * Secure token-based password reset functionality
 */

import crypto from 'crypto';

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
   * Validate password strength
   */
  validatePasswordStrength(password: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (password.length < 12) {
      errors.push('Password must be at least 12 characters');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

export const passwordResetService = new PasswordResetService();
export default passwordResetService;
