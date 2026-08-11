import { describe, it, expect } from 'vitest';
import {
  isOAuthMailboxProvider,
  resolveEmailSaveProvider,
  toMailboxProvider,
} from '../emailProvider';

describe('resolveEmailSaveProvider', () => {
  // Regression: the advanced panel hardcoded provider:'smtp', and PUT
  // /email/config writes that straight into settings.email.provider — the one
  // field getMailboxConnection() reads. A Microsoft 365 practice that expanded
  // "Show advanced" and hit Save lost two-way Inbox sync with its OAuth
  // credentials still stored but unused.
  it('keeps a connected OAuth mailbox when no mail server is configured', () => {
    expect(resolveEmailSaveProvider('microsoft365', '')).toBe('microsoft365');
    expect(resolveEmailSaveProvider('microsoft365', undefined)).toBe('microsoft365');
    expect(resolveEmailSaveProvider('gmail', '   ')).toBe('gmail');
    expect(resolveEmailSaveProvider('outlook', null)).toBe('outlook');
  });

  it('switches to SMTP only when the practice actually gave us a mail server', () => {
    expect(resolveEmailSaveProvider('microsoft365', 'smtp.office365.com')).toBe('smtp');
    expect(resolveEmailSaveProvider('smtp', 'mail.yourpractice.co.uk')).toBe('smtp');
  });

  it('falls back to SMTP when nothing is connected yet', () => {
    expect(resolveEmailSaveProvider(null, '')).toBe('smtp');
    expect(resolveEmailSaveProvider(undefined, undefined)).toBe('smtp');
    expect(resolveEmailSaveProvider('smtp', '')).toBe('smtp');
  });
});

describe('isOAuthMailboxProvider', () => {
  it('recognises the two-way mailbox providers', () => {
    expect(isOAuthMailboxProvider('gmail')).toBe(true);
    expect(isOAuthMailboxProvider('outlook')).toBe(true);
    expect(isOAuthMailboxProvider('microsoft365')).toBe(true);
  });

  it('does not treat SMTP or an unset provider as a mailbox', () => {
    expect(isOAuthMailboxProvider('smtp')).toBe(false);
    expect(isOAuthMailboxProvider(null)).toBe(false);
    expect(isOAuthMailboxProvider(undefined)).toBe(false);
  });
});

describe('toMailboxProvider', () => {
  // The picker used to always default to Microsoft 365, so a Gmail practice saw
  // "Not connected" and could rebind the wrong mailbox.
  it('maps a stored provider onto the picker options', () => {
    expect(toMailboxProvider('gmail')).toBe('gmail');
    expect(toMailboxProvider('outlook')).toBe('outlook');
    expect(toMailboxProvider('microsoft365')).toBe('microsoft365');
  });

  it('returns null for providers the picker does not offer', () => {
    expect(toMailboxProvider('smtp')).toBeNull();
    expect(toMailboxProvider(null)).toBeNull();
    expect(toMailboxProvider(undefined)).toBeNull();
  });
});
