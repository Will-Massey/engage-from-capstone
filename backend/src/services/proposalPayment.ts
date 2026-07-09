/**
 * Proposal payment helpers. Checkout is handled by Stripe Connect
 * (see services/proposalPaymentStripe.ts + services/paymentCollection.ts).
 */

export function proposalRequiresPayment(total: number): boolean {
  return total > 0;
}
