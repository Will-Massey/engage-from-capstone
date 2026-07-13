import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

// Minimum key material we accept in production. A short key is trivially
// brute-forceable, so fail closed rather than silently accept a weak secret.
const MIN_KEY_LENGTH = 32;

if (!ENCRYPTION_KEY) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY environment variable is required in production');
  }
  console.warn(
    '[encryption] ENCRYPTION_KEY not set — using ephemeral dev key (not for production)'
  );
} else if (process.env.NODE_ENV === 'production' && ENCRYPTION_KEY.length < MIN_KEY_LENGTH) {
  throw new Error(
    `ENCRYPTION_KEY must be at least ${MIN_KEY_LENGTH} characters in production (got ${ENCRYPTION_KEY.length})`
  );
}

const effectiveKey =
  ENCRYPTION_KEY || crypto.createHash('sha256').update('engage-dev-encryption-key').digest('hex');

// Ensure key is 32 bytes (256 bits) for AES-256-GCM
const deriveKey = (key: string): Buffer => {
  return crypto.createHash('sha256').update(key).digest();
};

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

/**
 * Encrypt sensitive data (like OAuth credentials)
 */
export function encrypt(text: string): string {
  if (!text) return '';

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = deriveKey(effectiveKey);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt sensitive data
 */
export function decrypt(encryptedData: string): string {
  if (!encryptedData) return '';

  if (!encryptedData.includes(':')) {
    return encryptedData;
  }

  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const key = deriveKey(effectiveKey);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Encrypt an object (like OAuth credentials)
 */
export function encryptObject(obj: Record<string, string>): Record<string, string> {
  const encrypted: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (['clientSecret', 'refreshToken', 'accessToken', 'pass', 'password'].includes(key)) {
      encrypted[key] = encrypt(value);
    } else {
      encrypted[key] = value;
    }
  }

  return encrypted;
}

/**
 * Decrypt an object
 */
export function decryptObject(obj: Record<string, string>): Record<string, string> {
  const decrypted: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (['clientSecret', 'refreshToken', 'accessToken', 'pass', 'password'].includes(key)) {
      decrypted[key] = decrypt(value);
    } else {
      decrypted[key] = value;
    }
  }

  return decrypted;
}

export default { encrypt, decrypt, encryptObject, decryptObject };
