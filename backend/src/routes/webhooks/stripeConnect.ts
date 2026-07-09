import { Router } from 'express';
import express from 'express';
import type Stripe from 'stripe';
import { stripe } from '../../config/stripe.js';
import { prisma } from '../../config/database.js';
import { asyncHandler, ApiError } from '../../middleware/errorHandler.js';
import { syncTransfersStatus } from '../../services/stripeConnectService.js';
import {
  handleChargeDisputed,
  handleChargeDisputeClosed,
  handleChargeRefunded,
} from '../../services/stripeDisputeService.js';
import { isE2eTestRequest } from '../../utils/securityFlags.js';
import logger from '../../config/logger.js';

const router = Router();

async function fulfilProposalPayment(session: {
  id?: string;
  metadata?: { proposalId?: string; tenantId?: string } | null;
  application_fee_amount?: number | null;
}) {
  const proposalId = session?.metadata?.proposalId;
  if (!proposalId) return;

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { id: true, paymentStatus: true, tenantId: true },
  });
  if (!proposal || proposal.paymentStatus === 'PAID') return; // idempotent

  await prisma.proposal.update({
    where: { id: proposalId },
    data: { paymentStatus: 'PAID' },
  });

  const tenantId = session.metadata?.tenantId || proposal.tenantId;
  try {
    await prisma.activityLog.create({
      data: {
        tenantId,
        action: 'PAYMENT_COMPLETED',
        entityType: 'PROPOSAL',
        entityId: proposalId,
        proposalId,
        description: 'payment completed',
        metadata: JSON.stringify({
          sessionId: session.id,
          applicationFee: session.application_fee_amount,
        }),
      },
    });
  } catch (err) {
    logger.warn('Failed to log payment completed activity', err);
  }
}

router.post(
  '/',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    let event: Stripe.Event | { type: string; data: { object: unknown } };

    // Playwright: accept unsigned JSON when e2e headers are valid.
    if (isE2eTestRequest(req.headers)) {
      const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');
      event = JSON.parse(raw || '{}');
    } else {
      if (!stripe) {
        throw new ApiError('STRIPE_NOT_CONFIGURED', 'Stripe is not configured', 503);
      }

      const sig = req.headers['stripe-signature'];
      // Two Stripe endpoints may point at this URL — account vs connected-account scope.
      const secrets = [
        process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
        process.env.STRIPE_CONNECT_ACCOUNT_WEBHOOK_SECRET,
      ].filter((s): s is string => Boolean(s));

      if (!sig || secrets.length === 0) {
        throw new ApiError('INVALID_WEBHOOK', 'Invalid webhook configuration', 400);
      }

      let verified: Stripe.Event | undefined;
      for (const secret of secrets) {
        try {
          verified = stripe.webhooks.constructEvent(req.body, sig as string, secret);
          break;
        } catch {
          // signature didn't match this secret — try the next one
        }
      }
      if (!verified) {
        throw new ApiError('INVALID_SIGNATURE', 'Invalid signature', 400);
      }
      event = verified;
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await fulfilProposalPayment(
          event.data.object as Parameters<typeof fulfilProposalPayment>[0]
        );
        break;
      case 'account.updated': {
        const acct = event.data.object as { id?: string };
        if (acct?.id) await syncTransfersStatus(acct.id);
        break;
      }
      case 'charge.dispute.created':
        await handleChargeDisputed(event.data.object as Parameters<typeof handleChargeDisputed>[0]);
        break;
      case 'charge.dispute.closed':
        await handleChargeDisputeClosed(
          event.data.object as Parameters<typeof handleChargeDisputeClosed>[0]
        );
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object as Parameters<typeof handleChargeRefunded>[0]);
        break;
      default:
        break;
    }

    res.json({ received: true });
  })
);

export default router;
