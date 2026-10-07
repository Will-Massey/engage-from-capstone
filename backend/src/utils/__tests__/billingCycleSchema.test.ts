import { z } from 'zod';
import { PricingFrequency } from '@prisma/client';
import { billingCycleSchema } from '../billingCycleSchema.js';

describe('hourly frequency validation', () => {
  it('accepts HOURLY on the Prisma pricing frequency enum used by service routes', () => {
    const schema = z.nativeEnum(PricingFrequency);
    expect(schema.parse('HOURLY')).toBe('HOURLY');
    expect(schema.safeParse('FORTNIGHTLY').success).toBe(false);
  });

  it('accepts HOURLY on the billing cycle schema and rejects unknown values', () => {
    expect(billingCycleSchema.parse('HOURLY')).toBe('HOURLY');
    expect(billingCycleSchema.parse('ONE_TIME')).toBe('ONE_TIME');
    expect(billingCycleSchema.safeParse('FORTNIGHTLY').success).toBe(false);
  });
});
