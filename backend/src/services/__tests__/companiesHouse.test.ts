import {
  companiesHouseSearchQuerySchema,
  companyNumberFromSearchItem,
  looksLikeCompanyNumber,
  normalizeCompanyNumber,
} from '../companiesHouse';

describe('normalizeCompanyNumber', () => {
  it('pads numeric numbers to 8 digits', () => {
    expect(normalizeCompanyNumber('445790')).toBe('00445790');
    expect(normalizeCompanyNumber('00445790')).toBe('00445790');
    expect(normalizeCompanyNumber('00 445 790')).toBe('00445790');
  });

  it('normalises prefixed Scottish / NI / LLP numbers', () => {
    expect(normalizeCompanyNumber('sc123456')).toBe('SC123456');
    expect(normalizeCompanyNumber('NI 123456')).toBe('NI123456');
    expect(normalizeCompanyNumber('oc12345')).toBe('OC012345');
  });

  it('rejects names and empty input', () => {
    expect(normalizeCompanyNumber('Tesco PLC')).toBeNull();
    expect(normalizeCompanyNumber('')).toBeNull();
    expect(normalizeCompanyNumber(null)).toBeNull();
  });
});

describe('looksLikeCompanyNumber', () => {
  it('accepts registration numbers and rejects names', () => {
    expect(looksLikeCompanyNumber('00445790')).toBe(true);
    expect(looksLikeCompanyNumber('SC123456')).toBe(true);
    expect(looksLikeCompanyNumber('Tesco')).toBe(false);
    expect(looksLikeCompanyNumber('Tesco PLC')).toBe(false);
    expect(looksLikeCompanyNumber('12')).toBe(false);
  });
});

describe('companyNumberFromSearchItem', () => {
  it('prefers company_number and falls back to links.self', () => {
    expect(companyNumberFromSearchItem({ company_number: '445790' })).toBe('00445790');
    expect(
      companyNumberFromSearchItem({
        links: { self: '/company/SC123456' },
      })
    ).toBe('SC123456');
  });
});

describe('companiesHouseSearchQuerySchema', () => {
  it('accepts a string limit from Express query params', () => {
    const parsed = companiesHouseSearchQuerySchema.parse({ q: 'Tesco', limit: '5' });
    expect(parsed.q).toBe('Tesco');
    expect(parsed.limit).toBe(5);
  });

  it('accepts a numeric limit (axios / qs quirks) and trims q', () => {
    const parsed = companiesHouseSearchQuerySchema.parse({ q: '  Tesco  ', limit: 8 });
    expect(parsed.q).toBe('Tesco');
    expect(parsed.limit).toBe(8);
  });

  it('defaults limit and unwraps repeated q', () => {
    const parsed = companiesHouseSearchQuerySchema.parse({ q: ['Harborne Joinery'] });
    expect(parsed.q).toBe('Harborne Joinery');
    expect(parsed.limit).toBe(10);
  });

  it('rejects an empty query', () => {
    expect(() => companiesHouseSearchQuerySchema.parse({ q: '  ' })).toThrow();
  });
});
