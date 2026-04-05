"use strict";
/**
 * Password Reset Service
 * Secure token-based password reset functionality
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.passwordResetService = exports.PasswordResetService = void 0;
const crypto_1 = __importDefault(require("crypto"));
class PasswordResetService {
    /**
     * Generate a secure password reset token
     */
    generateToken() {
        // Generate 32 bytes of random data
        const token = crypto_1.default.randomBytes(32).toString('hex');
        // Create hash for storage
        const tokenHash = crypto_1.default
            .createHash('sha256')
            .update(token)
            .digest('hex');
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
    hashToken(token) {
        return crypto_1.default
            .createHash('sha256')
            .update(token)
            .digest('hex');
    }
    /**
     * Generate a cryptographically secure password
     */
    generateSecurePassword(length = 16) {
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
        const bytes = crypto_1.default.randomBytes(length);
        let password = '';
        for (let i = 0; i < length; i++) {
            password += charset[bytes[i] % charset.length];
        }
        return password;
    }
    /**
     * Validate password strength
     */
    validatePasswordStrength(password) {
        const errors = [];
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
exports.PasswordResetService = PasswordResetService;
exports.passwordResetService = new PasswordResetService();
exports.default = exports.passwordResetService;
//# sourceMappingURL=passwordResetService.js.map