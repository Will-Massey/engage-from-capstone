import { Router } from 'express';
import express from 'express';
import type Stripe from 'stripe';
import { stripe } from '../../config/stripe.js';
import { prisma } from '../../config/database.js';
import { asyncHandler, ApiError } from '../../middleware/errorHandler.js';
import { syncTransfersStatus } from '../../services/stripeConnectService.js';
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
    if (!stripe) {
      throw new ApiError('STRIPE_NOT_CONFIGURED', 'Stripe is not configured', 503);
    }

    const sig = req.headers['stripe-signature'];
    // Two Stripe endpoints point at this URL — one "Your account" scope
    // (checkout.session.completed) and one "Connected accounts" scope
    // (account.updated) — each with its own signing secret. Verify against either.
    const secrets = [
      process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
      process.env.STRIPE_CONNECT_ACCOUNT_WEBHOOK_SECRET,
    ].filter((s): s is string => Boolean(s));

    if (!sig || secrets.length === 0) {
      throw new ApiError('INVALID_WEBHOOK', 'Invalid webhook configuration', 400);
    }

    let event: Stripe.Event | undefined;
    for (const secret of secrets) {
      try {
        event = stripe.webhooks.constructEvent(req.body, sig as string, secret);
        break;
      } catch {
        // signature didn't match this secret — try the next one
      }
    }
    if (!event) {
      throw new ApiError('INVALID_SIGNATURE', 'Invalid signature', 400);
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await fulfilProposalPayment(event.data.object as Parameters<typeof fulfilProposalPayment>[0]);
        break;
      case 'account.updated': {
        const acct = event.data.object as { id?: string };
        if (acct?.id) await syncTransfersStatus(acct.id);
        break;
      }
      default:
        break;
    }

    res.json({ received: true });
  })
);

export default router;
