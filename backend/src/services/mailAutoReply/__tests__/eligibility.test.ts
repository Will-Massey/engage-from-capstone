import {
  parseMailAutoReplySettings,
  isAutomatedSender,
  isWithinBusinessHours,
  containsMoneyFigure,
} from '../eligibility.js';

describe('parseMailAutoReplySettings', () => {
  it('defaults to disabled draft mode when the key is absent', () => {
    expect(parseMailAutoReplySettings('{}')).toEqual({
      enabled: false,
      mode: 'draft',
      businessHoursOnly: true,
    });
  });

  it('defaults to disabled on malformed JSON', () => {
    expect(parseMailAutoReplySettings('not json').enabled).toBe(false);
    expect(parseMailAutoReplySettings(null).enabled).toBe(false);
  });

  it('reads an enabled auto-mode tenant', () => {
    const json = JSON.stringify({
      mailAutoReply: { enabled: true, mode: 'auto', businessHoursOnly: false },
    });
    expect(parseMailAutoReplySettings(json)).toEqual({
      enabled: true,
      mode: 'auto',
      businessHoursOnly: false,
    });
  });

  it('coerces an unknown mode to draft — never silently auto-sends', () => {
    const json = JSON.stringify({ mailAutoReply: { enabled: true, mode: 'yolo' } });
    expect(parseMailAutoReplySettings(json).mode).toBe('draft');
  });
});

describe('isAutomatedSender', () => {
  it.each([
    'no-reply@xero.com',
    'noreply@hmrc.gov.uk',
    'donotreply@bank.co.uk',
    'MAILER-DAEMON@mail.example.com',
    'postmaster@example.com',
    'bounce+123@sendgrid.net',
    'no_reply@vendor.com',
  ])('flags %s', (addr) => {
    expect(isAutomatedSender(addr, 'Anything')).toBe(true);
  });

  it.each([
    ['ada@acme.co.uk', 'Automatic reply: Year end'],
    ['ada@acme.co.uk', 'Out of office'],
    ['ada@acme.co.uk', 'Undeliverable: your message'],
    ['ada@acme.co.uk', "Auto Reply: I'm out"],
  ])('flags %s by subject %s', (addr, subject) => {
    expect(isAutomatedSender(addr, subject)).toBe(true);
  });

  it('does not flag a real client writing normally', () => {
    expect(isAutomatedSender('Ada Lovelace <ada@acme.co.uk>', 'VAT question')).toBe(false);
  });

  it('does not flag a local part that merely contains "bounce" as a substring', () => {
    expect(isAutomatedSender('rebounce@acme.co.uk', 'VAT question')).toBe(false);
  });
});

describe('containsMoneyFigure', () => {
  it.each([
    'Your VAT due is £1,247.50',
    'about £90,000 in turnover',
    'the threshold is 90,000 GBP',
    'roughly 1247.50 to pay',
    'Your bill is 1500',
    'the fee is 450',
    '£1,247.50',
    'we invoiced 2500 last month',
  ])('flags %s', (text) => {
    expect(containsMoneyFigure(text)).toBe(true);
  });

  it('does not flag prose with dates, years or small counts', () => {
    expect(
      containsMoneyFigure('Please send the records by 7 October 2026 for all 3 companies.')
    ).toBe(false);
    expect(containsMoneyFigure('You have 2 outstanding requests.')).toBe(false);
  });

  it.each([
    'Can we speak at 14.30 today?',
    'the deadline is 31.12.2026',
    'see my email of 09/08/2026',
    'your 2026 return',
    'we spoke at 09:15',
  ])('does not flag %s', (text) => {
    expect(containsMoneyFigure(text)).toBe(false);
  });
});

describe('isWithinBusinessHours', () => {
  it('accepts a weekday mid-morning and rejects night, weekend and 18:00 exactly', () => {
    expect(isWithinBusinessHours(new Date('2026-08-11T09:30:00Z'))).toBe(true); // Tue
    expect(isWithinBusinessHours(new Date('2026-08-11T03:00:00Z'))).toBe(false);
    expect(isWithinBusinessHours(new Date('2026-08-09T10:00:00Z'))).toBe(false); // Sun
    expect(isWithinBusinessHours(new Date('2026-08-11T17:00:00Z'))).toBe(false); // 18:00 BST
  });
});
