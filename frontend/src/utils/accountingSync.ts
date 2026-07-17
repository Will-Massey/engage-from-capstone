/** Xero/QuickBooks sync settings helpers (R4.1) — pure logic for the Settings panels. */

import type { UpdateXeroSettingsPayload, XeroSyncMode } from '../types/integrations';

export interface XeroSyncModeOption {
  value: XeroSyncMode;
  label: string;
  description: string;
}

export const XERO_SYNC_MODE_OPTIONS: XeroSyncModeOption[] = [
  {
    value: 'repeating_draft',
    label: 'Draft repeating invoices',
    description:
      'On acceptance, create DRAFT repeating invoice templates in Xero for review. Approving them while Stripe also collects the fees will double-bill — use this when Xero is your billing source.',
  },
  {
    value: 'paid_invoices',
    label: 'Paid invoices (mirror Stripe)',
    description:
      'No repeating invoices. Each recurring payment Stripe collects is mirrored as an invoice in Xero, so your books always match the money actually collected.',
  },
];

/** Normalise a Xero account code input: trimmed, empty → null (clears the setting). */
export function normalizeAccountCode(input: string): string | null {
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Build the settings payload the API expects from the panel's form state. */
export function buildXeroSettingsPayload(form: {
  autoPushOnAcceptance: boolean;
  xeroSyncMode: XeroSyncMode;
  xeroPaymentAccountCode: string;
}): UpdateXeroSettingsPayload {
  return {
    autoPushOnAcceptance: form.autoPushOnAcceptance,
    xeroSyncMode: form.xeroSyncMode,
    // Payment account only applies to paid-invoices mode; clear it otherwise
    // so a stale code never silently marks future invoices as paid.
    xeroPaymentAccountCode:
      form.xeroSyncMode === 'paid_invoices'
        ? normalizeAccountCode(form.xeroPaymentAccountCode)
        : null,
  };
}
