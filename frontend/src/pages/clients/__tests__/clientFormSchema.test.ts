import { describe, expect, it } from 'vitest';
import {
  clientSchema,
  firstClientFormIssue,
  optionalNonNegativeNumber,
  resolveContactName,
} from '../clientFormSchema';

const filledBasics = {
  name: 'Tesco PLC',
  companyType: 'LIMITED_COMPANY' as const,
  contactEmail: 'accounts@tesco.test',
  contactName: '',
  contactPhone: '',
  companyNumber: '00445790',
  utr: '',
  employeeCount: '',
  turnover: '',
  mtditsaIncome: '',
  addressLine1: 'Tesco House',
  addressLine2: 'Shire Park',
  city: 'Welwyn Garden City',
  postcode: 'AL7 1GA',
  clientRelationship: 'NEW' as const,
  vatRegistered: false,
};

describe('optionalNonNegativeNumber', () => {
  it('treats empty and placeholder values as unset', () => {
    expect(optionalNonNegativeNumber('')).toBeUndefined();
    expect(optionalNonNegativeNumber(undefined)).toBeUndefined();
    expect(optionalNonNegativeNumber(Number.NaN)).toBeUndefined();
    expect(optionalNonNegativeNumber('£50,000')).toBe(50000);
    expect(optionalNonNegativeNumber('12')).toBe(12);
  });
});

describe('clientSchema', () => {
  it('accepts a Companies House-filled form with empty optional extras', () => {
    const parsed = clientSchema.safeParse(filledBasics);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe('Tesco PLC');
      expect(parsed.data.companyNumber).toBe('00445790');
      expect(parsed.data.employeeCount).toBeUndefined();
      expect(parsed.data.mtditsaIncome).toBeUndefined();
    }
  });

  it('trims required text so autofill spaces do not look like empty fields', () => {
    const parsed = clientSchema.safeParse({
      ...filledBasics,
      name: '  Acme Ltd  ',
      contactEmail: '  billing@acme.test  ',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe('Acme Ltd');
      expect(parsed.data.contactEmail).toBe('billing@acme.test');
    }
  });

  it('still requires a real email', () => {
    const parsed = clientSchema.safeParse({ ...filledBasics, contactEmail: '' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toMatch(/email/i);
    }
  });
});

describe('resolveContactName', () => {
  it('reuses the client name when the contact field was left blank', () => {
    expect(resolveContactName('Tesco PLC', '')).toBe('Tesco PLC');
    expect(resolveContactName('Tesco PLC', '  Jane Smith  ')).toBe('Jane Smith');
  });
});

describe('firstClientFormIssue', () => {
  it('sends the user back to step 1 for contact/email errors', () => {
    expect(
      firstClientFormIssue({
        contactEmail: { type: 'too_small', message: 'Email is required' },
      })
    ).toEqual({ step: 1, message: 'Email is required' });
  });

  it('keeps the user on details for optional-step errors', () => {
    expect(
      firstClientFormIssue({
        postcode: { type: 'custom', message: 'Invalid postcode' },
      })
    ).toEqual({ step: 2, message: 'Invalid postcode' });
  });
});
