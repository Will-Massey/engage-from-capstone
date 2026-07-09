/**
 * Connect dispute + refund handling for proposal payments.
 *
 * Engage is merchant of record on destination charges, so a chargeback is the
 * platform's liability. On `charge.dispute.created` we reverse the transfer to
 * recover the practice's share (protecting the platform); on `charge.dispute.closed`
 * we re-transfer if the dispute was won, or leave it recovered if lost. Refunds
 * are tracked (they should be created with `reverse_transfer: true`, which pulls
 * the practice's share back automatically — we do NOT reverse again here).
 *
 * All money operations are wrapped defensively and guarded on paymentStatus for
 * idempotency. REQUIRES CAREFUL REVIEW before enabling on live traffic.
 */
import { stripe } from '../config/stripe.js';
import { prisma } from '../config/database.js';
import logger from '../config/logger.js';

type MetaBag = Record<string, string> | null | undefined;

interface ChargeLike {
  id?: string;
  transfer?: string | { id?: string } | null;
  payment_intent?: string | { metadata?: MetaBag } | null;
  metadata?: MetaBag;
  amount_refunded?: number | null;
  currency?: string | null;
}

interface DisputeLike {
  id?: string;
  charge?: string | { id?: string } | null;
  status?: string | null;
}

function metaFromCharge(charge: ChargeLike): { proposalId?: string; tenantId?: string } {
  let meta: MetaBag = charge.metadata || {};
  const pi = charge.payment_intent;
  if (pi && typeof pi === 'object' && pi.metadata) {
    meta = { ...pi.metadata, ...meta };
  }
  return { proposalId: meta?.proposalId, tenantId: meta?.tenantId };
}

function transferIdOf(charge: ChargeLike): string | undefined {
  const t = charge.transfer;
  return typeof t === 'string' ? t : t?.id;
}

async function logPaymentEvent(
  tenantId: string,
  proposalId: string,
  action: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        tenantId,
        action,
        entityType: 'PROPOSAL',
        entityId: proposalId,
        proposalId,
        description: action.replace(/_/g, ' ').toLowerCase(),
        metadata: JSON.stringify(metadata),
      },
    });
  } catch (err) {
    logger.warn('Failed to log payment event', err);
  }
}

async function findProposal(proposalId: string) {
  return prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { id: true, paymentStatus: true, tenantId: true },
  });
}

/** charge.dispute.created — recover the practice's share to cover the liability. */
export async function handleChargeDisputed(dispute: DisputeLike): Promise<void> {
  if (!stripe) return;
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
  if (!chargeId) return;

  const charge = (await stripe.charges.retrieve(chargeId, {
    expand: ['payment_intent'],
  })) as ChargeLike;
  const { proposalId, tenantId } = metaFromCharge(charge);
  if (!proposalId) {
    logger.warn(`Connect dispute ${dispute.id}: no proposalId on charge ${chargeId}`);
    return;
  }
  const proposal = await findProposal(proposalId);
  if (!proposal || proposal.paymentStatus === 'DISPUTED') return; // idempotent

  const transferId = transferIdOf(charge);
  let reversed = false;
  if (transferId) {
    try {
      await stripe.transfers.createReversal(transferId, {
        refund_application_fee: true,
        description: `Dispute ${dispute.id} on proposal ${proposalId}`,
      });
      reversed = true;
    } catch (err) {
      logger.error(`Dispute ${dispute.id}: transfer reversal failed`, err);
    }
  }

  await prisma.proposal.update({ where: { id: proposalId }, data: { paymentStatus: 'DISPUTED' } });
  await logPaymentEvent(tenantId || proposal.tenantId, proposalId, 'PAYMENT_DISPUTED', {
    disputeId: dispute.id,
    chargeId,
    transferId,
    transferReversed: reversed,
  });
}

/** charge.dispute.closed — if won, re-pay the practice; if lost, keep recovered. */
export async function handleChargeDisputeClosed(dispute: DisputeLike): Promise<void> {
  if (!stripe) return;
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
  if (!chargeId) return;

  const charge = (await stripe.charges.retrieve(chargeId, {
    expand: ['payment_intent'],
  })) as ChargeLike;
  const { proposalId, tenantId } = metaFromCharge(charge);
  if (!proposalId) return;
  const proposal = await findProposal(proposalId);
  if (!proposal || proposal.paymentStatus !== 'DISPUTED') return; // only act on an open dispute

  const won = dispute.status === 'won';
  if (won) {
    // Re-transfer the practice's original share (their money after all).
    const transferId = transferIdOf(charge);
    let reTransferred = false;
    if (transferId) {
      try {
        const original = await stripe.transfers.retrieve(transferId);
        const dest =
          typeof original.destination === 'string'
            ? original.destination
            : (original.destination as { id?: string } | null)?.id;
        if (dest && original.amount > 0) {
          await stripe.transfers.create({
            amount: original.amount,
            currency: original.currency,
            destination: dest,
            description: `Dispute ${dispute.id} won — re-pay proposal ${proposalId}`,
          });
          reTransferred = true;
        }
      } catch (err) {
        logger.error(`Dispute ${dispute.id}: re-transfer on win failed`, err);
      }
    }
    await prisma.proposal.update({ where: { id: proposalId }, data: { paymentStatus: 'PAID' } });
    await logPaymentEvent(tenantId || proposal.tenantId, proposalId, 'PAYMENT_DISPUTE_WON', {
      disputeId: dispute.id,
      chargeId,
      reTransferred,
    });
  } else {
    await prisma.proposal.update({
      where: { id: proposalId },
      data: { paymentStatus: 'DISPUTE_LOST' },
    });
    await logPaymentEvent(tenantId || proposal.tenantId, proposalId, 'PAYMENT_DISPUTE_LOST', {
      disputeId: dispute.id,
      chargeId,
      status: dispute.status,
    });
  }
}

/** charge.refunded — track status. Refunds should carry reverse_transfer at creation. */
export async function handleChargeRefunded(charge: ChargeLike): Promise<void> {
  const { proposalId, tenantId } = metaFromCharge(charge);
  if (!proposalId) return;
  const proposal = await findProposal(proposalId);
  if (!proposal || proposal.paymentStatus === 'REFUNDED') return; // idempotent

  await prisma.proposal.update({ where: { id: proposalId }, data: { paymentStatus: 'REFUNDED' } });
  await logPaymentEvent(tenantId || proposal.tenantId, proposalId, 'PAYMENT_REFUNDED', {
    chargeId: charge.id,
    amountRefunded: charge.amount_refunded,
  });
}
