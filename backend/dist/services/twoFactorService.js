/**
 * Two-Factor Authentication Service
 * Implements TOTP-based 2FA for enhanced security
 */
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
// Encryption helpers for storing secrets
const ENCRYPTION_KEY = process.env.TWO_FACTOR_ENCRYPTION_KEY || process.env.JWT_SECRET;
function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-gcm', ENCRYPTION_KEY);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}
function decrypt(encryptedData) {
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const decipher = crypto.createDecipher('aes-256-gcm', ENCRYPTION_KEY);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
export class TwoFactorService {
    /**
     * Generate a new 2FA secret for a user
     */
    async generateSecret(userId, email) {
        const secret = speakeasy.generateSecret({
            name: `Engage:${email}`,
            length: 32,
            issuer: 'Engage by Capstone',
        });
        // Generate backup codes
        const backupCodes = Array.from({ length: 10 }, () => crypto.randomBytes(4).toString('hex').toUpperCase());
        // Generate QR code
        const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
        return {
            secret: secret.base32,
            qrCodeUrl,
            backupCodes,
        };
    }
    /**
     * Verify a TOTP token
     */
    verifyToken(secret, token) {
        return speakeasy.totp.verify({
            secret,
            encoding: 'base32',
            token,
            window: 2, // Allow 1 minute time drift
        });
    }
    /**
     * Verify a backup code
     */
    verifyBackupCode(backupCodes, code) {
        return backupCodes.includes(code.toUpperCase());
    }
    /**
     * Remove a used backup code
     */
    removeBackupCode(backupCodes, code) {
        return backupCodes.filter(c => c !== code.toUpperCase());
    }
    /**
     * Generate a new set of backup codes
     */
    generateBackupCodes() {
        return Array.from({ length: 10 }, () => crypto.randomBytes(4).toString('hex').toUpperCase());
    }
}
export const twoFactorService = new TwoFactorService();
export default twoFactorService;
