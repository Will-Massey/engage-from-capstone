/**
 * Engage platform billing config.
 * Platform subscriptions are billed via Stripe (see routes/payments.ts); this
 * module exposes read-only billing config for the Settings → Subscription UI.
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { prisma } from '../config/database.js';
import { SUBSCRIPTION_TIERS } from '../config/stripe.js';

const router = Router();

router.get(
  '/config',
  authenticate,
  asyncHandler(async (_req, res) => {
    const stripeReady = Boolean(
      process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY
    );
    res.json({
      success: true,
      data: {
        provider: stripeReady ? 'stripe' : null,
        billingEnabled: stripeReady,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
        tiers: SUBSCRIPTION_TIERS,
      },
    });
  })
);

router.get('/plans', (_req, res) => {
  const stripeReady = Boolean(process.env.STRIPE_SECRET_KEY);
  res.json({
    success: true,
    data: {
      provider: stripeReady ? 'stripe' : null,
      plans: Object.values(SUBSCRIPTION_TIERS),
    },
  });
});

router.get(
  '/subscription',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId! },
      select: {
        subscriptionTier: true,
        subscriptionStatus: true,
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
        provider: tenant.stripeSubscriptionId ? 'stripe' : null,
        lastPaymentDate: tenant.lastPaymentDate,
      },
    });
  })
);

export default router;
