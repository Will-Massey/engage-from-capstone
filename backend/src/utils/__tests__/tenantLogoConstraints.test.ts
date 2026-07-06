import { TENANT_LOGO_MAX_BYTES, validateTenantLogoForStorage } from '../tenantLogoConstraints.js';

describe('tenantLogoConstraints', () => {
  it('accepts empty logo', () => {
    expect(validateTenantLogoForStorage('')).toEqual({ ok: true, logo: '' });
  });

  it('accepts https logo URL', () => {
    const url = 'https://example.com/logo.png';
    expect(validateTenantLogoForStorage(url)).toEqual({ ok: true, logo: url });
  });

  it('rejects unsupported mime', () => {
    const logo = 'data:image/svg+xml;base64,PHN2Zy8+';
    const result = validateTenantLogoForStorage(logo);
    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        message: expect.stringMatching(/PNG, JPEG, or WebP/),
      })
    );
  });

  it('rejects oversized data URL', () => {
    const base64Len = Math.ceil(((TENANT_LOGO_MAX_BYTES + 1) * 4) / 3);
    const logo = `data:image/png;base64,${'A'.repeat(base64Len)}`;
    const result = validateTenantLogoForStorage(logo);
    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        message: expect.stringMatching(/too large/i),
      })
    );
  });
});
