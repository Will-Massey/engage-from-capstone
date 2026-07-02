import { prisma } from '../../config/database.js';
import logger from '../../config/logger.js';
import { getPlatformFeeBps } from './plans.js';
import { transferToAgency, isBusinessApiConfigured } from './business-client.js';

export interface SplitAmounts {
  totalPence: number;
  platformFeePence: number;
  agencySharePence: number;
  platformFeeBps: number;
}

export function calculatePaymentSplit(totalPence: number, feeBps = getPlatformFeeBps()): SplitAmounts {
  const platformFeePence = Math.round((totalPence * feeBps) / 10000);
  const agencySharePence = totalPence - platformFeePence;
  return { totalPence, platformFeePence, agencySharePence, platformFeeBps: feeBps };
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
  const split = calculatePaymentSplit(totalPence);

  const existing = await prisma.paymentSplit.findFirst({
    where: { revolutOrderId },
  });
  if (existing) return existing;

  const record = await prisma.paymentSplit.create({
    data: {
      proposalId,
      tenantId,
      revolutOrderId,
      totalPence: split.totalPence,
      platformFeePence: split.platformFeePence,
      agencySharePence: split.agencySharePence,
      platformFeeBps: split.platformFeeBps,
      currency: 'GBP',
      payoutStatus: isBusinessApiConfigured() ? 'PENDING' : 'MANUAL',
    },
  });

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
      }
    } catch (err) {
      logger.error('[billing] Agency payout failed', { proposalId, err });
      await prisma.paymentSplit.update({
        where: { id: record.id },
        data: { payoutStatus: 'FAILED' },
      });
    }
  }

  return record;
}