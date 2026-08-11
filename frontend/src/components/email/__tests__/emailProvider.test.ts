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
    expect(resolveEmailSaveProvider('microsoft365', '', false)).toBe('microsoft365');
    expect(resolveEmailSaveProvider('microsoft365', undefined, false)).toBe('microsoft365');
    expect(resolveEmailSaveProvider('gmail', '   ', false)).toBe('gmail');
    expect(resolveEmailSaveProvider('outlook', null, false)).toBe('outlook');
  });

  it('switches to SMTP when the practice types a new mail server', () => {
    expect(resolveEmailSaveProvider('microsoft365', 'smtp.office365.com', true)).toBe('smtp');
    expect(resolveEmailSaveProvider('smtp', 'mail.yourpractice.co.uk', true)).toBe('smtp');
  });

  // Regression: the first fix keyed off "smtpHost is truthy", but that field is
  // pre-populated from GET /email/config. A practice that ran SMTP before
  // connecting Microsoft 365/Google still has a stored host it never typed —
  // saving the advanced panel must not read that leftover value as intent to
  // switch away from the mailbox they just connected.
  it('keeps a connected OAuth mailbox when the host is a leftover, untouched value', () => {
    expect(resolveEmailSaveProvider('microsoft365', 'old-smtp.yourpractice.co.uk', false)).toBe(
      'microsoft365'
    );
    expect(resolveEmailSaveProvider('gmail', 'smtp.gmail.com', false)).toBe('gmail');
  });

  it('falls back to SMTP when nothing is connected yet', () => {
    expect(resolveEmailSaveProvider(null, '', false)).toBe('smtp');
    expect(resolveEmailSaveProvider(undefined, undefined, false)).toBe('smtp');
    expect(resolveEmailSaveProvider('smtp', '', false)).toBe('smtp');
  });

  it('stays on SMTP once already using it, dirty or not', () => {
    expect(resolveEmailSaveProvider('smtp', 'mail.yourpractice.co.uk', false)).toBe('smtp');
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
