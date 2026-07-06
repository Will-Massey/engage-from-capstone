import { z } from 'zod';

/**
 * Single source of truth for password strength. Used by registration, invited
 * user creation, change-password, and reset-password so the policy can never
 * drift between flows (previously registration accepted 8-char all-lowercase
 * while reset required 12 + complexity).
 */
export const PASSWORD_MIN_LENGTH = 12;

export function validatePasswordStrength(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
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

  return { isValid: errors.length === 0, errors };
}

/** Zod schema enforcing the shared policy — use for any new-password field. */
export const strongPasswordSchema = z.string().superRefine((password, ctx) => {
  for (const message of validatePasswordStrength(password).errors) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  }
});
