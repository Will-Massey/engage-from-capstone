/**
 * Engage platform billing config + Revolut proposal-payment webhook.
 * Platform subscriptions are billed via Stripe (see routes/payments.ts); this
 * module now only exposes billing config and the Revolut payout webhook.
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { prisma } from '../config/database.js';
import { isRevolutConfigured } from '../lib/revolut/revolut-client.js';
import { verifyRevolutWebhook } from '../lib/revolut/webhook.js';
import { PLATFORM_PLANS, isRevolutBillingEnabled } from '../lib/revolut/plans.js';
import { fulfilEngageOrder } from '../lib/revolut/fulfilment.js';
import { SUBSCRIPTION_TIERS } from '../config/stripe.js';

const router = Router();

router.get(
  '/config',
  authenticate,
  asyncHandler(async (_req, res) => {
    // Platform subscriptions bill through Stripe (recurring, with dunning).
    // Revolut is used only for proposal-payment payouts, never platform billing.
    const stripeReady = Boolean(
      process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY
    );
    res.json({
      success: true,
      data: {
        provider: stripeReady ? 'stripe' : null,
        mode: null,
        billingEnabled: stripeReady,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
        tiers: SUBSCRIPTION_TIERS,
        plans: Object.values(PLATFORM_PLANS),
      },
    });
  })
);

router.get('/plans', (_req, res) => {
  res.json({
    success: true,
    data: {
      provider: isRevolutConfigured() ? 'revolut' : null,
      plans: Object.values(PLATFORM_PLANS),
    },
  });
});

router.post(
  '/checkout',
  authenticate,
  asyncHandler(async (_req, _res) => {
    // Platform billing moved to Stripe (recurring). The Revolut one-time order
    // never renewed, so it is no longer offered for platform subscriptions.
    // Proposal-payment payouts still run through Revolut via /webhook.
    throw new ApiError(
      'PLATFORM_BILLING_MOVED',
      'Platform subscriptions are billed via Stripe. Please subscribe with a card in Settings → Subscription.',
      410
    );
  })
);

router.get(
  '/subscription',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId! },
      select: {
        subscriptionTier: true,
        subscriptionStatus: true,
        revolutOrderId: true,
        lastPaymentDate: true,
        stripeSubscriptionId: true,
      },
    });

    if (!tenant) {
      throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const hasSubscription =
      tenant.subscriptionStatus === 'active' || Boolean(tenant.stripeSubscriptionId);

    res.json({
      success: true,
      data: {
        hasSubscription,
        tier: tenant.subscriptionTier,
        status: tenant.subscriptionStatus,
        provider: tenant.revolutOrderId ? 'revolut' : tenant.stripeSubscriptionId ? 'stripe' : null,
        lastPaymentDate: tenant.lastPaymentDate,
      },
    });
  })
);

router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    if (!isRevolutBillingEnabled()) {
      throw new ApiError('BILLING_DISABLED', 'Billing not configured', 503);
    }

    const verified = verifyRevolutWebhook(req);
    if (!verified.ok) {
      const status = verified.error?.includes('signature') ? 401 : 403;
      res.status(status).send(verified.error);
      return;
    }

    const event = verified.event!;
    const eventType = event.event as string | undefined;

    try {
      if (eventType === 'ORDER_COMPLETED' || eventType === 'ORDER_AUTHORISED') {
        const order = (event.order || (event.data as Record<string, unknown>)?.order) as
          | Record<string, unknown>
          | undefined;
        await fulfilEngageOrder({
          order: order as Parameters<typeof fulfilEngageOrder>[0]['order'],
        });
      }
      res.sendStatus(200);
    } catch (err) {
      console.error('[billing] Engage webhook handler error:', err);
      res.sendStatus(500);
    }
  })
);

export default router;
