import { describe, expect, it } from 'vitest';
import { describeQuoteSendHistory } from '../quoteSendHistory';

describe('describeQuoteSendHistory', () => {
  it('records an emailed quote that the client later opened', () => {
    const history = describeQuoteSendHistory({
      status: 'VIEWED',
      sentAt: '2026-10-09T09:15:00.000Z',
      viewedAt: '2026-10-09T10:02:00.000Z',
      emailHistory: JSON.stringify([
        { sentAt: '2026-10-09T09:15:00.000Z', to: 'michaela@example.com' },
      ]),
    });

    expect(history.emailed).toBe(true);
    expect(history.emails).toEqual([
      { sentAt: '2026-10-09T09:15:00.000Z', to: 'michaela@example.com' },
    ]);
    expect(history.lines[0]).toContain('Emailed');
    expect(history.lines[0]).toContain('michaela@example.com');
    expect(history.lines.some((line) => line.startsWith('Opened'))).toBe(true);
    expect(history.lines.some((line) => line.includes('already sent'))).toBe(true);
  });

  it('keeps every email when the quote was sent more than once', () => {
    const history = describeQuoteSendHistory({
      status: 'SENT',
      sentAt: '2026-10-09T11:00:00.000Z',
      emailHistory: [
        { sentAt: '2026-10-09T09:00:00.000Z', to: 'michaela@example.com' },
        { sentAt: '2026-10-09T11:00:00.000Z', to: 'michaela@example.com' },
      ],
    });

    expect(history.emails).toHaveLength(2);
    expect(history.lines.filter((line) => line.startsWith('Emailed'))).toHaveLength(2);
    expect(history.lines.some((line) => line.startsWith('Opened'))).toBe(false);
  });

  it('says a copied client link was not an email', () => {
    const history = describeQuoteSendHistory({
      status: 'SENT',
      sentAt: '2026-10-09T09:40:00.000Z',
      emailHistory: '[]',
    });

    expect(history.emailed).toBe(false);
    expect(history.linkSharedAt).toBe('2026-10-09T09:40:00.000Z');
    expect(history.lines[0]).toContain('Not emailed');
    expect(history.lines[0]).toContain('client link was copied');
  });

  it('says a draft was not sent', () => {
    const history = describeQuoteSendHistory({
      status: 'DRAFT',
      emailHistory: 'not-json',
    });

    expect(history).toMatchObject({
      emailed: false,
      emails: [],
      linkSharedAt: null,
      viewedAt: null,
      lines: ['Not emailed.'],
    });
  });
});
