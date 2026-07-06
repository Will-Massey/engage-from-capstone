import { z } from 'zod';

/**
 * Client-side mirror of the backend password policy (backend
 * utils/passwordPolicy.ts is authoritative). Kept in sync so the UI never
 * accepts a password the server will reject.
 */
export const PASSWORD_MIN_LENGTH = 12;

export interface PasswordRule {
  label: string;
  met: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    met: (p) => p.length >= PASSWORD_MIN_LENGTH,
  },
  { label: 'One uppercase letter', met: (p) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter', met: (p) => /[a-z]/.test(p) },
  { label: 'One number', met: (p) => /[0-9]/.test(p) },
  { label: 'One special character', met: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function passwordIsStrong(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.met(password));
}

export const strongPasswordSchema = z.string().superRefine((password, ctx) => {
  for (const rule of PASSWORD_RULES) {
    if (!rule.met(password)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Password needs: ${rule.label.toLowerCase()}`,
      });
    }
  }
});
