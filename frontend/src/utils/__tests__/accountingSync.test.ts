import { describe, it, expect } from 'vitest';
import {
  XERO_SYNC_MODE_OPTIONS,
  normalizeAccountCode,
  buildXeroSettingsPayload,
} from '../accountingSync';

describe('XERO_SYNC_MODE_OPTIONS', () => {
  it('offers exactly the two backend sync modes, defaulting first to repeating_draft', () => {
    expect(XERO_SYNC_MODE_OPTIONS.map((o) => o.value)).toEqual([
      'repeating_draft',
      'paid_invoices',
    ]);
  });

  it('warns about double-billing on the repeating_draft option', () => {
    const draft = XERO_SYNC_MODE_OPTIONS.find((o) => o.value === 'repeating_draft')!;
    expect(draft.description.toLowerCase()).toContain('double-bill');
  });
});

describe('normalizeAccountCode', () => {
  it('trims whitespace', () => {
    expect(normalizeAccountCode('  090  ')).toBe('090');
  });

  it('maps empty and whitespace-only input to null (clears the setting)', () => {
    expect(normalizeAccountCode('')).toBeNull();
    expect(normalizeAccountCode('   ')).toBeNull();
  });
});

describe('buildXeroSettingsPayload', () => {
  it('passes the account code through in paid_invoices mode', () => {
    expect(
      buildXeroSettingsPayload({
        autoPushOnAcceptance: true,
        xeroSyncMode: 'paid_invoices',
        xeroPaymentAccountCode: ' 090 ',
      })
    ).toEqual({
      autoPushOnAcceptance: true,
      xeroSyncMode: 'paid_invoices',
      xeroPaymentAccountCode: '090',
    });
  });

  it('clears the account code outside paid_invoices mode (stale codes must not auto-pay)', () => {
    expect(
      buildXeroSettingsPayload({
        autoPushOnAcceptance: false,
        xeroSyncMode: 'repeating_draft',
        xeroPaymentAccountCode: '090',
      })
    ).toEqual({
      autoPushOnAcceptance: false,
      xeroSyncMode: 'repeating_draft',
      xeroPaymentAccountCode: null,
    });
  });

  it('sends null (not undefined) for an empty code so the API clears it', () => {
    const payload = buildXeroSettingsPayload({
      autoPushOnAcceptance: true,
      xeroSyncMode: 'paid_invoices',
      xeroPaymentAccountCode: '',
    });
    expect(payload.xeroPaymentAccountCode).toBeNull();
  });
});
