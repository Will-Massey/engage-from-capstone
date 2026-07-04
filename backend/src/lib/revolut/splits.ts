import { prisma } from '../../config/database.js';
import logger from '../../config/logger.js';
import { transferToAgency, isBusinessApiConfigured } from './business-client.js';
import {
  calculateSplit,
  estimateProcessorCost,
  estimateProcessorMarkup,
  resolvePlatformFeeBps,
} from '../payments/splitCalculator.js';
import { isPayoutCollectionEnabled } from '../../services/payoutSettingsService.js';

export interface SplitAmounts {
  totalPence: number;
  platformFeePence: number;
  processorFeePence: number;
  processorMarkupPence: number;
  agencySharePence: number;
  platformFeeBps: number;
}

export async function recordProposalPaymentSplit({
  proposalId,
  tenantId,
  revolutOrderId,
  totalPence,
}: {
  proposalId: string;
  tenantId: string;
  revolutOrderId: string;
  totalPence: number;
}) {
  const payoutEnabled = await isPayoutCollectionEnabled(tenantId);
  if (!payoutEnabled) {
    logger.info('[billing] Payout collection disabled — skipping split', { proposalId, tenantId });
    return null;
  }

  const [payoutSettings, tenant] = await Promise.all([
    prisma.tenantPayoutSettings.findUnique({ where: { tenantId } }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { subscriptionTier: true },
    }),
  ]);

  const platformFeeBps = resolvePlatformFeeBps(
    tenant?.subscriptionTier,
    payoutSettings?.platformFeeBpsOverride,
  );

  const split = calculateSplit({
    grossPence: totalPence,
    platformFeeBps,
    processorFeePence: estimateProcessorCost('REVOLUT', totalPence),
    processorMarkupPence: estimateProcessorMarkup(totalPence),
  });

  const idempotencyKey = `revolut:${revolutOrderId}`;

  const existing = await prisma.paymentSplit.findFirst({
    where: { OR: [{ revolutOrderId }, { idempotencyKey }] },
  });
  if (existing) return existing;

  const holdFirstPayout =
    payoutSettings?.firstPayoutHeldUntil &&
    payoutSettings.firstPayoutHeldUntil.getTime() > Date.now();

  const payoutStatus =
    !isBusinessApiConfigured() || holdFirstPayout
      ? holdFirstPayout
        ? 'HELD'
        : 'MANUAL'
      : 'PENDING';

  const record = await prisma.paymentSplit.create({
    data: {
      proposalId,
      tenantId,
      revolutOrderId,
      idempotencyKey,
      totalPence: split.grossPence,
      platformFeePence: split.platformFeePence,
      processorFeePence: split.processorFeePence,
      processorMarkupPence: split.processorMarkupPence,
      agencySharePence: split.agencySharePence,
      platformFeeBps: split.platformFeeBps,
      currency: 'GBP',
      payoutStatus,
    },
  });

  if (payoutStatus === 'HELD') {
    logger.info('[billing] First payout held for verification window', { proposalId, tenantId });
    return record;
  }

  if (isBusinessApiConfigured() && split.agencySharePence > 0) {
    try {
      const transfer = await transferToAgency({
        tenantId,
        amountPence: split.agencySharePence,
        reference: `engage-proposal-${proposalId}`,
        revolutOrderId,
      });

      if (transfer?.id) {
        await prisma.paymentSplit.update({
          where: { id: record.id },
          data: {
            payoutStatus: 'TRANSFERRED',
            payoutTransferId: transfer.id,
          },
        });

        if (payoutSettings && !payoutSettings.verifiedAt) {
          await prisma.tenantPayoutSettings.update({
            where: { tenantId },
            data: {
              verifiedAt: new Date(),
              verificationStatus: 'VERIFIED',
              firstPayoutHeldUntil: null,
            },
          });
        }
      }
    } catch (err) {
      logger.error('[billing] Agency payout failed', { proposalId, err });
      await prisma.paymentSplit.update({
        where: { id: record.id },
        data: {
          payoutStatus: 'FAILED',
          payoutFailureReason: err instanceof Error ? err.message : 'Payout failed',
        },
      });
    }
  }

  return record;
}

/** @deprecated use calculateSplit from splitCalculator */
export function calculatePaymentSplit(totalPence: number, feeBps?: number): SplitAmounts {
  const split = calculateSplit({
    grossPence: totalPence,
    platformFeeBps: feeBps,
    processorFeePence: estimateProcessorCost('REVOLUT', totalPence),
    processorMarkupPence: estimateProcessorMarkup(totalPence),
  });
  return split;
}