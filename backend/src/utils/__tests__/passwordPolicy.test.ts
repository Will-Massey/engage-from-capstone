import {
  validatePasswordStrength,
  strongPasswordSchema,
  PASSWORD_MIN_LENGTH,
} from '../passwordPolicy';

describe('passwordPolicy', () => {
  it('accepts a strong password', () => {
    const result = validatePasswordStrength('DemoPass123!');
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects the previously-allowed 8-char all-lowercase password', () => {
    const result = validatePasswordStrength('password');
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it.each([
    ['too short', 'Ab1!aaa', /at least/i],
    ['no uppercase', 'lowercase123!!', /uppercase/i],
    ['no lowercase', 'UPPERCASE123!!', /lowercase/i],
    ['no number', 'NoDigitsHere!!', /number/i],
    ['no special', 'NoSpecials1234', /special/i],
  ])('flags %s', (_label, password, pattern) => {
    const { isValid, errors } = validatePasswordStrength(password);
    expect(isValid).toBe(false);
    expect(errors.join(' ')).toMatch(pattern);
  });

  it('enforces the shared minimum length', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(validatePasswordStrength('Ab1!'.padEnd(PASSWORD_MIN_LENGTH - 1, 'x')).isValid).toBe(
      false
    );
  });

  it('exposes the same policy through the zod schema', () => {
    expect(strongPasswordSchema.safeParse('DemoPass123!').success).toBe(true);
    expect(strongPasswordSchema.safeParse('weak').success).toBe(false);
  });
});
