import { createOrder, isRevolutConfigured, getRevolutMode } from '../lib/revolut/revolut-client.js';
import { prisma } from '../config/database.js';

interface ProposalForCheckout {
  id: string;
  tenantId: string;
  reference: string;
  title: string;
  total: number;
  paymentStatus: string | null;
  client: {
    name: string;
    contactName: string | null;
    contactEmail: string | null;
  };
}

export function proposalRequiresPayment(total: number): boolean {
  return total > 0;
}

export async function createProposalCheckoutOrder(
  proposal: ProposalForCheckout,
  signer: { email: string; name: string },
  shareToken: string,
) {
  if (!isRevolutConfigured()) {
    return null;
  }

  if (!proposalRequiresPayment(proposal.total)) {
    return null;
  }

  if (proposal.paymentStatus === 'COMPLETED') {
    return null;
  }

  const amountPence = Math.round(proposal.total * 100);
  const frontendUrl = (
    process.env.FRONTEND_URL ||
    process.env.PUBLIC_PROPOSAL_URL ||
    'http://localhost:5173'
  ).replace(/\/$/, '');

  const extRef = `engage:proposal:${proposal.id}:${proposal.tenantId}`;
  const order = await createOrder({
    amount: amountPence,
    currency: 'GBP',
    description: `Proposal ${proposal.reference}: ${proposal.title}`,
    customer: {
      email: signer.email,
      full_name: signer.name,
    },
    merchantOrderExtRef: extRef,
    redirectUrl: `${frontendUrl}/proposals/view/${shareToken}?payment=success`,
    metadata: {
      product: 'engage',
      type: 'proposal_payment',
      proposalId: proposal.id,
      tenantId: proposal.tenantId,
      reference: proposal.reference,
    },
  });

  await prisma.proposal.update({
    where: { id: proposal.id },
    data: {
      paymentId: order.id,
      paymentMandateId: order.id,
      paymentProvider: 'revolut',
      paymentStatus: 'PENDING',
      paymentUrl: order.checkout_url || null,
      paymentMethod: 'revolut',
    },
  });

  return {
    provider: 'revolut' as const,
    token: order.token,
    orderId: order.id,
    mode: getRevolutMode(),
    amount: proposal.total,
    checkoutUrl: order.checkout_url || null,
  };
}