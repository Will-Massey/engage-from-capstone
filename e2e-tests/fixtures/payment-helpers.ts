import { type APIRequestContext } from '@playwright/test';
import { API_BASE, apiPut, expectOkApi } from './build-helpers';

export const PAYMENT_COLLECTION_TERMS_VERSION = 'ENGAGE-PCT-2026-001';

/** Opt the demo tenant into post-sign Stripe collection (idempotent; uses e2e Connect stub). */
export async function enablePayoutCollectionForE2e(request: APIRequestContext): Promise<void> {
  const result = await apiPut(request, '/payout/settings', {
    enabled: true,
    consentAccepted: true,
    consentVersion: PAYMENT_COLLECTION_TERMS_VERSION,
    payoutMethod: 'STRIPE_CONNECT',
    collectPaymentAtSign: true,
  });
  await expectOkApi('enable payout collection', result);
}

/** Simulate Stripe Connect checkout.session.completed (e2e unsigned path). */
export async function simulateStripeCheckoutCompleted(
  request: APIRequestContext,
  opts: {
    sessionId: string;
    proposalId: string;
    tenantId: string;
    applicationFeePence?: number;
  }
): Promise<void> {
  const body = JSON.stringify({
    type: 'checkout.session.completed',
    data: {
      object: {
        id: opts.sessionId,
        metadata: {
          proposalId: opts.proposalId,
          tenantId: opts.tenantId,
        },
        application_fee_amount: opts.applicationFeePence ?? 0,
      },
    },
  });

  const res = await request.post(`${API_BASE}/webhooks/stripe-connect`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Mode': 'e2e',
    },
    data: body,
  });

  if (!res.ok()) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Stripe Connect webhook simulation failed (${res.status()}): ${text.slice(0, 300)}`
    );
  }
}

export function totalToPence(total: number): number {
  return Math.round(total * 100);
}
