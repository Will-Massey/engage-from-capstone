import { describe, expect, it } from 'vitest';
import { parseClientPrefill, parseNextAction } from '../clientPrefill';

function encode(payload: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('parseClientPrefill', () => {
  it('decodes a full allowlisted payload (base64url, unicode-safe)', () => {
    const search = `?prefill=${encode({
      name: 'Mick Ó Plasterer',
      contactName: 'Mick Ó Plasterer',
      contactEmail: 'mick@example.test',
      contactPhone: '+44 7700 900000',
      companyType: 'SOLE_TRADER',
      source: 'graft',
    })}&next=proposal`;
    expect(parseClientPrefill(search)).toEqual({
      name: 'Mick Ó Plasterer',
      contactName: 'Mick Ó Plasterer',
      contactEmail: 'mick@example.test',
      contactPhone: '+44 7700 900000',
      companyType: 'SOLE_TRADER',
      notes: undefined,
      source: 'graft',
    });
  });

  it('drops unknown keys and non-string values; invalid companyType is ignored', () => {
    const search = `prefill=${encode({
      name: 'A',
      companyType: 'MEGACORP',
      isAdmin: true,
      turnover: 999999,
    })}`;
    const parsed = parseClientPrefill(search);
    expect(parsed).toEqual({
      name: 'A',
      contactName: undefined,
      contactEmail: undefined,
      contactPhone: undefined,
      companyType: undefined,
      notes: undefined,
      source: undefined,
    });
    expect(parsed && 'isAdmin' in parsed).toBe(false);
  });

  it('returns null for a missing, malformed, or empty blob', () => {
    expect(parseClientPrefill('')).toBeNull();
    expect(parseClientPrefill('?next=proposal')).toBeNull();
    expect(parseClientPrefill('?prefill=%%%not-base64%%%')).toBeNull();
    expect(parseClientPrefill(`?prefill=${encode({})}`)).toBeNull();
    expect(parseClientPrefill(`?prefill=${encode('just a string')}`)).toBeNull();
  });

  it('trims and caps field lengths', () => {
    const parsed = parseClientPrefill(`?prefill=${encode({ name: `  ${'x'.repeat(600)}  ` })}`);
    expect(parsed?.name).toHaveLength(500);
  });
});

describe('parseNextAction', () => {
  it("recognises only 'proposal'", () => {
    expect(parseNextAction('?next=proposal')).toBe('proposal');
    expect(parseNextAction('?next=invoice')).toBeNull();
    expect(parseNextAction('')).toBeNull();
  });
});
