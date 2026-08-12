import { describe, it, expect, vi } from 'vitest';

// happy-dom's DOM implementation doesn't support DOMPurify's traversal well
// enough to exercise real sanitization in this test environment (it silently
// stops stripping tags DOMPurify strips fine in an actual browser), so this
// mocks the library to verify sanitizeMailHtml's own logic — the null-input
// short-circuit and delegating to DOMPurify.sanitize with the right allowlist.
const sanitizeMock = vi.fn((html: string, _opts?: unknown) => `sanitized:${html}`);
vi.mock('dompurify', () => ({
  default: { sanitize: (html: string, opts: unknown) => sanitizeMock(html, opts) },
}));

const { sanitizeMailHtml, formatAttachmentSize, formatSyncHealth, extractEmailAddress } =
  await import('../mailboxHelpers');

describe('sanitizeMailHtml', () => {
  it('returns empty string for null/undefined/empty input without calling DOMPurify', () => {
    expect(sanitizeMailHtml(null)).toBe('');
    expect(sanitizeMailHtml(undefined)).toBe('');
    expect(sanitizeMailHtml('')).toBe('');
    expect(sanitizeMock).not.toHaveBeenCalled();
  });

  it('delegates to DOMPurify.sanitize with a safe formatting-only allowlist', () => {
    const out = sanitizeMailHtml('<p>Hello <script>alert(1)</script></p>');
    expect(out).toBe('sanitized:<p>Hello <script>alert(1)</script></p>');
    expect(sanitizeMock).toHaveBeenCalledWith(
      '<p>Hello <script>alert(1)</script></p>',
      expect.objectContaining({
        ALLOWED_TAGS: expect.arrayContaining(['p', 'strong', 'a', 'div']),
        ALLOWED_ATTR: expect.arrayContaining(['href', 'class']),
      })
    );
    // The allowlist must not include script/iframe/img — that's what keeps this safe.
    const [, opts] = sanitizeMock.mock.calls[0] as [string, { ALLOWED_TAGS: string[] }];
    expect(opts.ALLOWED_TAGS).not.toContain('script');
    expect(opts.ALLOWED_TAGS).not.toContain('iframe');
    expect(opts.ALLOWED_TAGS).not.toContain('img');
  });
});

describe('formatAttachmentSize', () => {
  it('returns empty string for falsy or negative input', () => {
    expect(formatAttachmentSize(0)).toBe('');
    expect(formatAttachmentSize(-5)).toBe('');
  });

  it('formats bytes', () => {
    expect(formatAttachmentSize(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatAttachmentSize(2048)).toBe('2 KB');
  });

  it('formats megabytes with one decimal', () => {
    expect(formatAttachmentSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });
});

describe('extractEmailAddress', () => {
  it('extracts the address from "Name <email>" display form', () => {
    expect(extractEmailAddress('Emma Wilson Design Studio <emma@ewdesign.co.uk>')).toBe(
      'emma@ewdesign.co.uk'
    );
  });

  it('accepts a bare address as-is', () => {
    expect(extractEmailAddress('emma@ewdesign.co.uk')).toBe('emma@ewdesign.co.uk');
  });

  it('trims surrounding whitespace', () => {
    expect(extractEmailAddress('  emma@ewdesign.co.uk  ')).toBe('emma@ewdesign.co.uk');
    expect(extractEmailAddress('  Emma Wilson  <emma@ewdesign.co.uk>  ')).toBe(
      'emma@ewdesign.co.uk'
    );
  });

  it('returns "" for junk / unparseable input', () => {
    expect(extractEmailAddress('Not an email address')).toBe('');
    expect(extractEmailAddress('')).toBe('');
    expect(extractEmailAddress(null)).toBe('');
    expect(extractEmailAddress(undefined)).toBe('');
    expect(extractEmailAddress('   ')).toBe('');
  });

  it('picks the first address out of a comma-separated list', () => {
    expect(extractEmailAddress('a@b.com, c@d.com')).toBe('a@b.com');
  });
});

describe('formatSyncHealth', () => {
  const now = new Date('2026-08-06T12:00:00.000Z');

  it('reports "Not yet synced" when health is missing or never synced', () => {
    expect(formatSyncHealth(null, now)).toEqual({ tone: 'neutral', message: 'Not yet synced' });
    expect(
      formatSyncHealth({ lastSyncAt: null, lastSyncOk: null, lastSyncError: null }, now)
    ).toEqual({ tone: 'neutral', message: 'Not yet synced' });
  });

  it('reports a warning with the error when the last sync failed', () => {
    const result = formatSyncHealth(
      { lastSyncAt: '2026-08-06T11:00:00.000Z', lastSyncOk: false, lastSyncError: 'Token expired' },
      now
    );
    expect(result.tone).toBe('warning');
    expect(result.message).toBe('Sync failing: Token expired — reconnect in Settings → Email');
  });

  it('omits the colon when there is no error message', () => {
    const result = formatSyncHealth(
      { lastSyncAt: '2026-08-06T11:00:00.000Z', lastSyncOk: false, lastSyncError: null },
      now
    );
    expect(result.message).toBe('Sync failing');
  });

  /**
   * The banner used to tell every practice to reconnect, whatever the failure.
   * On 2026-08-11 the real failure was a Prisma write error in our own sync
   * code; the connection was perfectly healthy, and reconnecting would have
   * wasted the practice's time and taught them to distrust the banner. Only
   * offer the reconnect when the error actually looks like an auth problem.
   */
  it('offers reconnecting only when the failure looks like an auth problem', () => {
    const authErrors = [
      'Token expired',
      'invalid_grant',
      'AADSTS700082: refresh token expired',
      'Unauthorized (401)',
    ];
    for (const err of authErrors) {
      const result = formatSyncHealth(
        { lastSyncAt: '2026-08-06T11:00:00.000Z', lastSyncOk: false, lastSyncError: err },
        now
      );
      expect(result.message).toBe(`Sync failing: ${err} — reconnect in Settings → Email`);
    }
  });

  it('does NOT tell the practice to reconnect when the fault is not authentication', () => {
    const result = formatSyncHealth(
      {
        lastSyncAt: '2026-08-06T11:00:00.000Z',
        lastSyncOk: false,
        lastSyncError:
          'Invalid `prisma.mailMessage.create()` invocation: unexpected end of hex escape',
      },
      now
    );
    expect(result.tone).toBe('warning');
    expect(result.message).not.toContain('reconnect');
    expect(result.message).toContain('hex escape');
  });

  it('reports success with a relative time when the last sync worked', () => {
    const result = formatSyncHealth(
      { lastSyncAt: '2026-08-06T11:00:00.000Z', lastSyncOk: true, lastSyncError: null },
      now
    );
    expect(result.tone).toBe('success');
    expect(result.message).toBe('Last synced about 1 hour ago');
  });
});
