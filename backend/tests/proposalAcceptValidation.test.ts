/**
 * Zod validation for POST /api/proposals/:id/accept (2026-07-07 audit M3).
 */
import { acceptSchema } from '../src/routes/proposals/lifecycle.js';

const validSignature = 'data:image/png;base64,' + 'A'.repeat(200);

describe('acceptSchema', () => {
  it('accepts a full valid payload', () => {
    const parsed = acceptSchema.parse({
      signature: validSignature,
      acceptedBy: 'Jane Client',
      signatoryPosition: 'Director',
      deviceInfo: 'Safari on macOS',
    });
    expect(parsed.signature).toBe(validSignature);
    expect(parsed.acceptedBy).toBe('Jane Client');
  });

  it('accepts signature-only payload (optional fields omitted)', () => {
    const parsed = acceptSchema.parse({ signature: validSignature });
    expect(parsed.acceptedBy).toBeUndefined();
    expect(parsed.signatoryPosition).toBeUndefined();
    expect(parsed.deviceInfo).toBeUndefined();
  });

  it('rejects a missing signature', () => {
    expect(acceptSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a signature shorter than 100 chars', () => {
    expect(acceptSchema.safeParse({ signature: 'too-short' }).success).toBe(false);
  });

  it('rejects a signature over 500k chars', () => {
    expect(acceptSchema.safeParse({ signature: 'A'.repeat(500_001) }).success).toBe(false);
  });

  it('rejects non-string signature', () => {
    expect(acceptSchema.safeParse({ signature: 12345 }).success).toBe(false);
  });

  it('rejects over-long optional fields', () => {
    expect(
      acceptSchema.safeParse({ signature: validSignature, acceptedBy: 'x'.repeat(201) }).success
    ).toBe(false);
    expect(
      acceptSchema.safeParse({ signature: validSignature, signatoryPosition: 'x'.repeat(201) })
        .success
    ).toBe(false);
    expect(
      acceptSchema.safeParse({ signature: validSignature, deviceInfo: 'x'.repeat(2001) }).success
    ).toBe(false);
  });
});
