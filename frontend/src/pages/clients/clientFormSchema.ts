import type { FieldErrors } from 'react-hook-form';
import { z } from 'zod';

/** Empty / placeholder number inputs must not fail the whole client form. */
export function optionalNonNegativeNumber(val: unknown): number | undefined {
  if (val === '' || val === null || val === undefined) return undefined;
  if (typeof val === 'number') return Number.isFinite(val) ? val : undefined;
  const n = Number(String(val).replace(/[,£\s]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

const optionalAmount = z.preprocess(optionalNonNegativeNumber, z.number().min(0).optional());

export const clientSchema = z.object({
  name: z.string().trim().min(1, 'Client name is required'),
  companyType: z.enum([
    'LIMITED_COMPANY',
    'SOLE_TRADER',
    'PARTNERSHIP',
    'LLP',
    'CHARITY',
    'NON_PROFIT',
  ]),
  contactEmail: z.string().trim().min(1, 'Email is required').email('Please enter a valid email'),
  contactPhone: z.string().optional(),
  // Backend treats this as optional; the legal client name is enough to create.
  contactName: z.string().trim().optional(),
  companyNumber: z.string().optional(),
  utr: z.string().optional(),
  vatRegistered: z.boolean().default(false),
  industry: z.string().optional(),
  employeeCount: optionalAmount,
  turnover: optionalAmount,
  mtditsaIncome: optionalAmount,
  notes: z.string().optional(),
  clientRelationship: z.enum(['NEW', 'EXISTING']).default('NEW'),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  postcode: z.string().optional(),
});

export type ClientForm = z.infer<typeof clientSchema>;

export const STEP1_REQUIRED_FIELDS = ['name', 'companyType', 'contactEmail'] as const;

export const STEP1_FIELDS = [
  'name',
  'companyType',
  'contactEmail',
  'contactName',
  'contactPhone',
  'clientRelationship',
] as const;

const STEP1_FIELD_SET = new Set<string>(STEP1_FIELDS);

export function firstClientFormIssue(errors: FieldErrors<ClientForm>): {
  step: 1 | 2;
  message: string;
} {
  const keys = Object.keys(errors) as (keyof ClientForm)[];
  const first = keys[0];
  if (!first) {
    return { step: 1, message: 'Please check the highlighted fields' };
  }
  const raw = errors[first];
  const message =
    raw &&
    typeof raw === 'object' &&
    'message' in raw &&
    typeof raw.message === 'string' &&
    raw.message
      ? raw.message
      : 'Please check the highlighted fields';
  return { step: STEP1_FIELD_SET.has(first) ? 1 : 2, message };
}

/** Prefer the named contact; otherwise use the legal client name already on the form. */
export function resolveContactName(name: string, contactName?: string): string {
  const named = contactName?.trim();
  return named || name.trim();
}
