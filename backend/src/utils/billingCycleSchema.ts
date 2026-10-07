import { z } from 'zod';

/** Postgres BillingCycle values, including hourly (rate × hours, not a calendar period). */
export const BILLING_CYCLE_VALUES = [
  'FIXED_DATE',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'ANNUALLY',
  'ONE_TIME',
  'HOURLY',
] as const;

export const billingCycleSchema = z.enum(BILLING_CYCLE_VALUES);
