import { buildValidityRevivePatch } from '../reviveOnValidity.js';

const future = new Date('2026-12-01T12:00:00.000Z');
const past = new Date('2026-01-01T12:00:00.000Z');
const now = new Date('2026-09-01T08:00:00.000Z');

describe('buildValidityRevivePatch', () => {
  it('returns null when the new date is still in the past', () => {
    expect(
      buildValidityRevivePatch({
        currentStatus: 'EXPIRED',
        nextValidUntil: past,
        now,
      })
    ).toBeNull();
  });

  it('revives EXPIRED to SENT and clears expiredAt', () => {
    expect(
      buildValidityRevivePatch({
        currentStatus: 'EXPIRED',
        viewedAt: null,
        nextValidUntil: future,
        now,
      })
    ).toEqual({ status: 'SENT', expiredAt: null });
  });

  it('revives EXPIRED to VIEWED when the client already opened it', () => {
    expect(
      buildValidityRevivePatch({
        currentStatus: 'EXPIRED',
        viewedAt: new Date('2026-08-01T12:00:00.000Z'),
        nextValidUntil: future,
        now,
      })
    ).toEqual({ status: 'VIEWED', expiredAt: null });
  });

  it('does not reopen a signed or declined proposal', () => {
    expect(
      buildValidityRevivePatch({
        currentStatus: 'ACCEPTED',
        nextValidUntil: future,
        now,
      })
    ).toBeNull();
  });

  it('extends a share link that would expire before the new valid-until', () => {
    const patch = buildValidityRevivePatch({
      currentStatus: 'SENT',
      nextValidUntil: future,
      shareToken: 'tok_1',
      shareTokenExpiry: past,
      publicAccessEnabled: true,
      now,
    });
    expect(patch).toEqual({ expiredAt: null, shareTokenExpiry: future });
  });
});
