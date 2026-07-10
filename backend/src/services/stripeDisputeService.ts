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
  amount?: number | null;
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
    const original = await stripe.transfers.retrieve(transferId);
    if (original.amount_reversed >= original.amount) {
      // Already fully clawed back (e.g. a refund created with reverse_transfer).
      reversed = true;
    } else {
      try {
        await stripe.transfers.createReversal(
          transferId,
          {
            refund_application_fee: true,
            description: `Dispute ${dispute.id} on proposal ${proposalId}`,
          },
          // Duplicate webhook deliveries race the status guard — same dispute
          // must never reverse twice.
          { idempotencyKey: `dispute-reversal-${dispute.id}` }
        );
        reversed = true;
      } catch (err) {
        // Rethrow so the webhook 500s and Stripe retries — the proposal stays
        // un-DISPUTED so the retry re-attempts the reversal.
        logger.error(`Dispute ${dispute.id}: transfer reversal failed`, err);
        throw err;
      }
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
        // Repay only what the dispute actually clawed back. If the reversal at
        // dispute.created failed, the practice still has their share — paying
        // original.amount here would pay them twice.
        if (dest && original.amount_reversed > 0) {
          await stripe.transfers.create(
            {
              amount: original.amount_reversed,
              currency: original.currency,
              destination: dest,
              description: `Dispute ${dispute.id} won — re-pay proposal ${proposalId}`,
            },
            // Same dispute must never pay the practice twice on duplicate delivery.
            { idempotencyKey: `dispute-won-${dispute.id}` }
          );
          reTransferred = true;
        }
      } catch (err) {
        // Rethrow so the webhook 500s and Stripe retries — the proposal stays
        // DISPUTED so the retry re-attempts the re-transfer.
        logger.error(`Dispute ${dispute.id}: re-transfer on win failed`, err);
        throw err;
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

  // charge.refunded also fires on partial refunds — only a full refund flips
  // the proposal to REFUNDED; partials are logged for the audit trail.
  const isPartial =
    typeof charge.amount === 'number' &&
    typeof charge.amount_refunded === 'number' &&
    charge.amount_refunded < charge.amount;
  if (isPartial) {
    await logPaymentEvent(tenantId || proposal.tenantId, proposalId, 'PAYMENT_PARTIALLY_REFUNDED', {
      chargeId: charge.id,
      amount: charge.amount,
      amountRefunded: charge.amount_refunded,
    });
    return;
  }

  await prisma.proposal.update({ where: { id: proposalId }, data: { paymentStatus: 'REFUNDED' } });
  await logPaymentEvent(tenantId || proposal.tenantId, proposalId, 'PAYMENT_REFUNDED', {
    chargeId: charge.id,
    amountRefunded: charge.amount_refunded,
  });
}

const OPEN_DISPUTE_STATUSES = new Set([
  'needs_response',
  'warning_needs_response',
  'under_review',
  'warning_under_review',
]);

/**
 * Reconciliation backstop for missed or out-of-order dispute webhooks: re-drive
 * the idempotent handlers from Stripe's own dispute list. The paymentStatus
 * guards and idempotency keys make repeated runs safe.
 */
export async function reconcileDisputes(
  daysBack = 90
): Promise<{ scanned: number; errors: number }> {
  if (!stripe) return { scanned: 0, errors: 0 };

  const createdGte = Math.floor(Date.now() / 1000) - daysBack * 86400;
  let scanned = 0;
  let errors = 0;
  let startingAfter: string | undefined;

  for (;;) {
    const page = await stripe.disputes.list({
      created: { gte: createdGte },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    for (const dispute of page.data) {
      scanned++;
      try {
        if (OPEN_DISPUTE_STATUSES.has(dispute.status)) {
          await handleChargeDisputed(dispute as DisputeLike);
        } else if (dispute.status === 'won' || dispute.status === 'lost') {
          await handleChargeDisputeClosed(dispute as DisputeLike);
        }
      } catch (err) {
        errors++;
        logger.error(`Dispute reconciliation: ${dispute.id} failed`, err);
      }
    }

    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1].id;
  }

  if (scanned > 0) logger.info(`Dispute reconciliation: scanned ${scanned}, errors ${errors}`);
  return { scanned, errors };
}
