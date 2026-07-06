import { maskAccountLast4, validateUkBankDetails } from '../ukBankValidation.js';

describe('ukBankValidation', () => {
  it('accepts valid UK bank details', () => {
    const result = validateUkBankDetails('200000', '55779911');
    expect(result.ok).toBe(true);
  });

  it('rejects invalid sort code length', () => {
    const result = validateUkBankDetails('20-00', '55779911');
    expect(result.ok).toBe(false);
  });

  it('masks account last four', () => {
    expect(maskAccountLast4('55779911')).toBe('****9911');
  });
});
