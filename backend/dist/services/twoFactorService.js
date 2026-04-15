"use strict";
/**
 * Two-Factor Authentication Service
 * Implements TOTP-based 2FA for enhanced security
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.twoFactorService = exports.TwoFactorService = void 0;
const speakeasy_1 = __importDefault(require("speakeasy"));
const qrcode_1 = __importDefault(require("qrcode"));
const crypto_1 = __importDefault(require("crypto"));
// Encryption helpers for storing secrets
const ENCRYPTION_KEY = process.env.TWO_FACTOR_ENCRYPTION_KEY || process.env.JWT_SECRET;
function encrypt(text) {
    const iv = crypto_1.default.randomBytes(16);
    const cipher = crypto_1.default.createCipher('aes-256-gcm', ENCRYPTION_KEY);
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
    const decipher = crypto_1.default.createDecipher('aes-256-gcm', ENCRYPTION_KEY);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
class TwoFactorService {
    /**
     * Generate a new 2FA secret for a user
     */
    async generateSecret(userId, email) {
        const secret = speakeasy_1.default.generateSecret({
            name: `Engage:${email}`,
            length: 32,
            issuer: 'Engage by Capstone',
        });
        // Generate backup codes
        const backupCodes = Array.from({ length: 10 }, () => crypto_1.default.randomBytes(4).toString('hex').toUpperCase());
        // Generate QR code
        const qrCodeUrl = await qrcode_1.default.toDataURL(secret.otpauth_url);
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
        return speakeasy_1.default.totp.verify({
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
        return backupCodes.filter((c) => c !== code.toUpperCase());
    }
    /**
     * Generate a new set of backup codes
     */
    generateBackupCodes() {
        return Array.from({ length: 10 }, () => crypto_1.default.randomBytes(4).toString('hex').toUpperCase());
    }
}
exports.TwoFactorService = TwoFactorService;
exports.twoFactorService = new TwoFactorService();
exports.default = exports.twoFactorService;
//# sourceMappingURL=twoFactorService.js.map