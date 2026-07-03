/**
 * Engage Revolut billing — agency platform subscriptions + unified webhook.
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { prisma } from '../config/database.js';
import {
  createOrder,
  isRevolutConfigured,
  getRevolutMode,
} from '../lib/revolut/revolut-client.js';
import { verifyRevolutWebhook } from '../lib/revolut/webhook.js';
import {
  PLATFORM_PLANS,
  isRevolutBillingEnabled,
  type SubscriptionTierKey,
} from '../lib/revolut/plans.js';
import { fulfilEngageOrder } from '../lib/revolut/fulfilment.js';
import { SUBSCRIPTION_TIERS } from '../config/stripe.js';

const router = Router();

router.get(
  '/config',
  authenticate,
  asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      data: {
        provider: isRevolutConfigured() ? 'revolut' : 'stripe',
        revolutPublicKey: process.env.REVOLUT_API_PUBLIC_KEY || null,
        mode: getRevolutMode(),
        billingEnabled: isRevolutBillingEnabled() || Boolean(process.env.STRIPE_SECRET_KEY),
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
        tiers: SUBSCRIPTION_TIERS,
        plans: Object.values(PLATFORM_PLANS),
      },
    });
  }),
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
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    if (!isRevolutConfigured()) {
      throw new ApiError(
        'REVOLUT_NOT_CONFIGURED',
        'Revolut billing is not configured. Contact support.',
        503,
      );
    }

    const schema = z.object({
      tier: z.enum([
        'STARTER',
        'PROFESSIONAL',
        'ENTERPRISE',
        'STARTER_ANNUAL',
        'PROFESSIONAL_ANNUAL',
        'ENTERPRISE_ANNUAL',
      ]),
    });
    const { tier } = schema.parse(req.body);
    const plan = PLATFORM_PLANS[tier as SubscriptionTierKey];
    const tenantId = req.tenantId!;

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    const extRef = `engage:platform:${tenantId}:${tier}`;

    const order = await createOrder({
      amount: plan.amount,
      currency: plan.currency,
      description: plan.description,
      customer: {
        email: req.user!.email,
        full_name: `${req.user!.firstName} ${req.user!.lastName}`.trim(),
      },
      merchantOrderExtRef: extRef,
      redirectUrl: `${frontendUrl}/subscription?billing=success`,
      metadata: {
        product: 'engage',
        type: 'platform_subscription',
        tenantId,
        tier,
      },
    });

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { revolutOrderId: order.id },
    });

    res.json({
      success: true,
      data: {
        provider: 'revolut',
        token: order.token,
        orderId: order.id,
        mode: getRevolutMode(),
        tier,
        amount: plan.displayPrice,
      },
    });
  }),
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
  }),
);

router.post('/webhook', asyncHandler(async (req, res) => {
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
      await fulfilEngageOrder({ order: order as Parameters<typeof fulfilEngageOrder>[0]['order'] });
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('[billing] Engage webhook handler error:', err);
    res.sendStatus(500);
  }
}));

export default router;