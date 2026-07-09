import { stripe } from '../config/stripe.js';
import {
  calculateSplit,
  estimateProcessorCost,
  estimateProcessorMarkup,
} from '../lib/payments/splitCalculator.js';

export interface StripeCheckoutInput {
  proposalId: string;
  tenantId: string;
  reference: string;
  title: string;
  grossPence: number;
  connectedAccountId: string;
  platformFeeBps: number;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export interface StripeCheckoutResult {
  sessionId: string;
  checkoutUrl: string;
  applicationFeePence: number;
}

/**
 * Create a destination-charge Checkout Session for a post-sign proposal payment.
 * Engage is merchant of record; funds transfer to the practice's connected account
 * minus application_fee_amount (= platform fee + processor markup).
 */
export async function createStripeProposalCheckout(
  input: StripeCheckoutInput
): Promise<StripeCheckoutResult> {
  const processorFeePence = estimateProcessorCost('STRIPE', input.grossPence);
  const processorMarkupPence = estimateProcessorMarkup(input.grossPence);
  const split = calculateSplit({
    grossPence: input.grossPence,
    platformFeeBps: input.platformFeeBps,
    processorFeePence,
    processorMarkupPence,
  });
  const applicationFeePence = split.engageRevenuePence;

  // Playwright stub — no live Stripe when the connected account is the e2e sentinel.
  if (input.connectedAccountId === 'acct_e2e_stub') {
    return {
      sessionId: `cs_e2e_${input.proposalId}`,
      checkoutUrl: '',
      applicationFeePence,
    };
  }

  if (!stripe) throw new Error('STRIPE_NOT_CONFIGURED');

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: input.customerEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'gbp',
          unit_amount: input.grossPence,
          product_data: { name: `${input.reference} — ${input.title}` },
        },
      },
    ],
    payment_intent_data: {
      application_fee_amount: applicationFeePence,
      transfer_data: { destination: input.connectedAccountId },
    },
    metadata: { proposalId: input.proposalId, tenantId: input.tenantId },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });

  return { sessionId: session.id, checkoutUrl: session.url ?? '', applicationFeePence };
}
