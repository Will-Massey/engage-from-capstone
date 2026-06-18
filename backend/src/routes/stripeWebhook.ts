import { Router } from 'express';
import express from 'express';
import { stripe } from '../config/stripe.js';
import { prisma } from '../config/database.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

const router = Router();

function getTierFromPriceId(priceId: string): string {
  const priceToTier: Record<string, string> = {
    [process.env.STRIPE_STARTER_PRICE_ID || '']: 'STARTER',
    [process.env.STRIPE_PROFESSIONAL_PRICE_ID || '']: 'PROFESSIONAL',
    [process.env.STRIPE_ENTERPRISE_PRICE_ID || '']: 'ENTERPRISE',
  };
  return priceToTier[priceId] || 'STARTER';
}

async function handlePaymentSucceeded(invoice: any) {
  await prisma.tenant.updateMany({
    where: { stripeCustomerId: invoice.customer },
    data: {
      lastPaymentStatus: 'succeeded',
      lastPaymentDate: new Date(),
    },
  });
}

async function handlePaymentFailed(invoice: any) {
  await prisma.tenant.updateMany({
    where: { stripeCustomerId: invoice.customer },
    data: {
      lastPaymentStatus: 'failed',
      subscriptionStatus: 'past_due',
    },
  });
}

async function handleSubscriptionDeleted(subscription: any) {
  await prisma.tenant.updateMany({
    where: { stripeCustomerId: subscription.customer },
    data: {
      subscriptionStatus: 'cancelled',
      subscriptionTier: null,
      stripeSubscriptionId: null,
    },
  });
}

async function handleSubscriptionUpdated(subscription: any) {
  await prisma.tenant.updateMany({
    where: { stripeCustomerId: subscription.customer },
    data: {
      subscriptionStatus: subscription.status,
    },
  });
}

router.post(
  '/',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    if (!stripe) {
      throw new ApiError('STRIPE_NOT_CONFIGURED', 'Stripe is not configured', 503);
    }

    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !endpointSecret) {
      throw new ApiError('INVALID_WEBHOOK', 'Invalid webhook configuration', 400);
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch {
      throw new ApiError('INVALID_SIGNATURE', 'Invalid signature', 400);
    }

    switch (event.type) {
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
    }

    res.json({ received: true });
  })
);

export default router;
