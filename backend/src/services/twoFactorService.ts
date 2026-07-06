/**
 * Two-Factor Authentication Service
 * Implements TOTP-based 2FA for enhanced security
 */

import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { encrypt, decrypt } from '../utils/encryption.js';

export interface TwoFactorSetup {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export class TwoFactorService {
  /**
   * Generate a new 2FA secret for a user
   */
  async generateSecret(_userId: string, email: string): Promise<TwoFactorSetup> {
    const secret = speakeasy.generateSecret({
      name: `Engage:${email}`,
      length: 32,
      issuer: 'Engage by Capstone',
    });

    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    return {
      secret: secret.base32!,
      qrCodeUrl,
      backupCodes,
    };
  }

  /**
   * Encrypt a TOTP secret for database storage
   */
  encryptSecret(secret: string): string {
    return encrypt(secret);
  }

  /**
   * Decrypt a stored TOTP secret
   */
  decryptSecret(encryptedSecret: string): string {
    return decrypt(encryptedSecret);
  }

  /**
   * Hash a backup code for storage
   */
  hashBackupCode(code: string): string {
    return crypto.createHash('sha256').update(code.toUpperCase().trim()).digest('hex');
  }

  /**
   * Verify a TOTP token
   */
  verifyToken(secret: string, token: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: token.trim(),
      window: 2,
    });
  }

  /**
   * Verify a backup code against a list of hashed codes
   */
  verifyBackupCode(backupCodes: string[], code: string): boolean {
    return backupCodes.includes(code.toUpperCase().trim());
  }

  /**
   * Remove a used backup code
   */
  removeBackupCode(backupCodes: string[], code: string): string[] {
    return backupCodes.filter((c) => c !== code.toUpperCase().trim());
  }

  /**
   * Generate a new set of backup codes
   */
  generateBackupCodes(): string[] {
    return Array.from({ length: 10 }, () => crypto.randomBytes(4).toString('hex').toUpperCase());
  }
}

export const twoFactorService = new TwoFactorService();
export default twoFactorService;
