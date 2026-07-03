import { prisma } from '../../config/database.js';
import logger from '../../config/logger.js';
import { getEngageSuperadmin } from '../superadmin.js';
import { PLATFORM_PLANS, type SubscriptionTierKey } from './plans.js';
import { recordProposalPaymentSplit } from './splits.js';

type OrderPayload = {
  id?: string;
  metadata?: Record<string, string>;
  merchant_order_ext_ref?: string;
  amount?: number;
};

export async function fulfilEngageOrder(event: { order?: OrderPayload }) {
  const order = event.order || {};
  const metadata = order.metadata || {};
  const type = metadata.type as 'platform_subscription' | 'proposal_payment' | undefined;

  if (type === 'platform_subscription') {
    await fulfilPlatformSubscription(order, metadata);
    return;
  }

  if (type === 'proposal_payment') {
    await fulfilProposalPayment(order, metadata);
    return;
  }

  // Fallback: parse merchant_order_ext_ref
  const extRef = String(order.merchant_order_ext_ref || '');
  const parts = extRef.split(':');
  if (parts[0] === 'engage' && parts[1] === 'platform') {
    await fulfilPlatformSubscription(order, {
      tenantId: parts[2],
      tier: parts[3],
      type: 'platform_subscription',
    });
  } else if (parts[0] === 'engage' && parts[1] === 'proposal') {
    await fulfilProposalPayment(order, {
      proposalId: parts[2],
      tenantId: parts[3],
      type: 'proposal_payment',
    });
  }
}

async function fulfilPlatformSubscription(
  order: OrderPayload,
  metadata: Record<string, string>,
) {
  let tenantId = metadata.tenantId;
  let tier = metadata.tier as SubscriptionTierKey | undefined;

  if (!tenantId || !tier) {
    const extRef = String(order.merchant_order_ext_ref || '');
    const parts = extRef.split(':');
    if (parts[0] === 'engage' && parts[1] === 'platform') {
      tenantId = parts[2];
      tier = parts[3] as SubscriptionTierKey;
    }
  }

  if (!tenantId || !tier || !PLATFORM_PLANS[tier]) {
    logger.warn('[billing] platform subscription webhook: missing tenant or tier', order.id);
    return;
  }

  const tenantBefore = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { subscriptionStatus: true },
  });

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      subscriptionTier: tier,
      subscriptionStatus: 'active',
      revolutOrderId: order.id || undefined,
      lastPaymentStatus: 'succeeded',
      lastPaymentDate: new Date(),
    },
  });

  const plan = PLATFORM_PLANS[tier];
  const mrr =
    plan.billingInterval === 'annual'
      ? Math.round((plan.annualTotal || plan.displayPrice * 12) / 12)
      : plan.displayPrice;

  const superadmin = getEngageSuperadmin();
  if (superadmin && tenantBefore?.subscriptionStatus === 'trial') {
    try {
      await superadmin.reportConversion({
        tenantId,
        plan: tier.replace(/_ANNUAL$/, ''),
        mrr,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('[billing] Superadmin conversion reporting failed:', message);
    }
  }

  logger.info(`[billing] Engage platform subscription activated: ${tenantId} ${tier}`);
}

async function fulfilProposalPayment(order: OrderPayload, metadata: Record<string, string>) {
  let proposalId = metadata.proposalId;
  let tenantId = metadata.tenantId;

  if (!proposalId || !tenantId) {
    const extRef = String(order.merchant_order_ext_ref || '');
    const parts = extRef.split(':');
    if (parts[0] === 'engage' && parts[1] === 'proposal') {
      proposalId = parts[2];
      tenantId = parts[3];
    }
  }

  if (!proposalId || !tenantId) {
    logger.warn('[billing] proposal payment webhook: missing ids', order.id);
    return;
  }

  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId },
    select: { id: true, total: true, paymentStatus: true },
  });

  if (!proposal) return;
  if (proposal.paymentStatus === 'COMPLETED') return;

  const totalPence = Math.round(proposal.total * 100);

  await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      paymentId: order.id || undefined,
      paymentStatus: 'COMPLETED',
      paymentMethod: 'revolut',
      paidAt: new Date(),
    },
  });

  await recordProposalPaymentSplit({
    proposalId,
    tenantId,
    revolutOrderId: order.id || '',
    totalPence,
  });

  logger.info(`[billing] Engage proposal payment completed: ${proposalId}`);
}