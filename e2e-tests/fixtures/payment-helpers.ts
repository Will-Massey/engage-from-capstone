import crypto from 'crypto';
import { type APIRequestContext } from '@playwright/test';
import { API_BASE, apiPut, expectOkApi } from './build-helpers';

export const PAYMENT_COLLECTION_TERMS_VERSION = 'ENGAGE-PCT-2026-001';

export const E2E_REVOLUT_WEBHOOK_SECRET = process.env.REVOLUT_WEBHOOK_SECRET || 'e2e-webhook-stub';

/** Opt the demo tenant into post-sign Revolut checkout (idempotent). */
export async function enablePayoutCollectionForE2e(request: APIRequestContext): Promise<void> {
  const result = await apiPut(request, '/payout/settings', {
    enabled: true,
    consentAccepted: true,
    consentVersion: PAYMENT_COLLECTION_TERMS_VERSION,
    payoutMethod: 'REVOLUT_COUNTERPARTY',
    revolutCounterpartyId: 'e2e-counterparty-stub',
    allowCard: true,
    allowRevolutPay: true,
    collectPaymentAtSign: true,
  });
  await expectOkApi('enable payout collection', result);
}

/** Simulate Revolut ORDER_COMPLETED so fulfilment records the payment split. */
export async function simulateRevolutOrderCompleted(
  request: APIRequestContext,
  opts: {
    orderId: string;
    proposalId: string;
    tenantId: string;
    amountPence: number;
  }
): Promise<void> {
  const body = JSON.stringify({
    event: 'ORDER_COMPLETED',
    order: {
      id: opts.orderId,
      amount: opts.amountPence,
      merchant_order_ext_ref: `engage:proposal:${opts.proposalId}:${opts.tenantId}`,
      metadata: {
        type: 'proposal_payment',
        proposalId: opts.proposalId,
        tenantId: opts.tenantId,
      },
    },
  });

  const timestamp = String(Date.now());
  const version = 'v1';
  const payloadToSign = `${version}.${timestamp}.${body}`;
  const sig = crypto
    .createHmac('sha256', E2E_REVOLUT_WEBHOOK_SECRET)
    .update(payloadToSign)
    .digest('hex');

  const res = await request.post(`${API_BASE}/billing/webhook`, {
    headers: {
      'Content-Type': 'application/json',
      'revolut-signature': `v1=${sig}`,
      'revolut-request-timestamp': timestamp,
      'X-Test-Mode': 'e2e',
    },
    data: body,
  });

  if (!res.ok()) {
    const text = await res.text().catch(() => '');
    throw new Error(`Revolut webhook simulation failed (${res.status()}): ${text.slice(0, 300)}`);
  }
}

export function totalToPence(total: number): number {
  return Math.round(total * 100);
}
