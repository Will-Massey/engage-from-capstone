import { Router } from 'express';
import { z } from 'zod';
import { stripe, SUBSCRIPTION_TIERS } from '../config/stripe.js';
import { prisma } from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { evaluateTenantBilling, getTrialEndsAt } from '../services/subscriptionService.js';

const router = Router();

// Helper to check if Stripe is configured
const checkStripe = () => {
  if (!stripe) {
    throw new ApiError(
      'STRIPE_NOT_CONFIGURED',
      'Payments are not configured. Please contact support.',
      503
    );
  }
};

/**
 * GET /api/payments/config
 * Get Stripe publishable key and configuration
 */
router.get(
  '/config',
  authenticate,
  asyncHandler(async (req, res) => {
    const isEnabled = !!stripe && !!process.env.STRIPE_PUBLISHABLE_KEY;

    res.json({
      success: true,
      data: {
        isEnabled,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
        tiers: SUBSCRIPTION_TIERS,
      },
    });
  })
);

/**
 * POST /api/payments/create-subscription
 * Create a subscription for the tenant
 */
router.post(
  '/create-subscription',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    checkStripe();
    const schema = z.object({
      priceId: z.string(),
      paymentMethodId: z.string(),
    });

    const { priceId, paymentMethodId } = schema.parse(req.body);
    const tenantId = req.tenantId!;

    // Get tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    // Create or get Stripe customer
    let customerId = tenant.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        name: tenant.name,
        metadata: {
          tenantId: tenant.id,
        },
      });
      customerId = customer.id;

      // Update tenant with Stripe customer ID
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { stripeCustomerId: customerId },
      });
    }

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    // Set as default payment method
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_settings: {
        payment_method_options: {
          card: {
            request_three_d_secure: 'automatic',
          },
        },
        payment_method_types: ['card'],
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
    });

    // Update tenant with subscription info
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        subscriptionTier: getTierFromPriceId(priceId),
      },
    });

    res.json({
      success: true,
      data: {
        subscriptionId: subscription.id,
        status: subscription.status,
        clientSecret: (subscription.latest_invoice as any)?.payment_intent?.client_secret,
      },
    });
  })
);

/**
 * GET /api/payments/subscription
 * Get current subscription status
 */
router.get(
  '/subscription',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        createdAt: true,
        settings: true,
        stripeSubscriptionId: true,
        subscriptionStatus: true,
        subscriptionTier: true,
        stripeCustomerId: true,
      },
    });

    if (!tenant) {
      throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const billing = evaluateTenantBilling(tenant);
    const trialEndsAt = getTrialEndsAt(tenant);

    if (!tenant.stripeSubscriptionId) {
      return res.json({
        success: true,
        data: {
          hasSubscription: false,
          tier: tenant.subscriptionTier,
          status: tenant.subscriptionStatus || 'trialing',
          trialEndsAt: trialEndsAt.toISOString(),
          daysRemaining: billing.daysRemaining,
          canSendProposals: billing.allowed,
        },
      });
    }

    // If Stripe is not configured, return cached DB state
    if (!stripe) {
      return res.json({
        success: true,
        data: {
          hasSubscription: true,
          tier: tenant.subscriptionTier,
          status: tenant.subscriptionStatus,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          trialEndsAt: trialEndsAt.toISOString(),
          daysRemaining: billing.daysRemaining,
          canSendProposals: billing.allowed,
        },
      });
    }

    // Get subscription details from Stripe
    const subscription = (await stripe.subscriptions.retrieve(tenant.stripeSubscriptionId)) as any;

    res.json({
      success: true,
      data: {
        hasSubscription: true,
        tier: tenant.subscriptionTier,
        status: subscription.status,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        trialEndsAt: trialEndsAt.toISOString(),
        daysRemaining: billing.daysRemaining,
        canSendProposals: billing.allowed,
      },
    });
  })
);

/**
 * POST /api/payments/cancel-subscription
 * Cancel subscription at period end
 */
router.post(
  '/cancel-subscription',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    checkStripe();
    const tenantId = req.tenantId!;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { stripeSubscriptionId: true },
    });

    if (!tenant?.stripeSubscriptionId) {
      throw new ApiError('NO_SUBSCRIPTION', 'No active subscription found', 400);
    }

    // Cancel at period end
    const subscription = (await stripe!.subscriptions.update(tenant.stripeSubscriptionId, {
      cancel_at_period_end: true,
    })) as any;

    // Update tenant
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { subscriptionStatus: subscription.status },
    });

    res.json({
      success: true,
      data: {
        status: subscription.status,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      },
    });
  })
);

/**
 * POST /api/payments/reactivate-subscription
 * Reactivate a cancelled subscription
 */
router.post(
  '/reactivate-subscription',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    checkStripe();
    const tenantId = req.tenantId!;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { stripeSubscriptionId: true },
    });

    if (!tenant?.stripeSubscriptionId) {
      throw new ApiError('NO_SUBSCRIPTION', 'No subscription found', 400);
    }

    // Reactivate
    const subscription = await stripe.subscriptions.update(tenant.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    // Update tenant
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { subscriptionStatus: subscription.status },
    });

    res.json({
      success: true,
      data: {
        status: subscription.status,
        cancelAtPeriodEnd: false,
      },
    });
  })
);

/**
 * POST /api/payments/create-setup-intent
 * Create setup intent for adding payment method
 */
router.post(
  '/create-setup-intent',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    checkStripe();
    const tenantId = req.tenantId!;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { stripeCustomerId: true },
    });

    if (!tenant?.stripeCustomerId) {
      throw new ApiError('NO_CUSTOMER', 'No Stripe customer found', 400);
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: tenant.stripeCustomerId,
      payment_method_types: ['card'],
    });

    res.json({
      success: true,
      data: {
        clientSecret: setupIntent.client_secret,
      },
    });
  })
);

function getTierFromPriceId(priceId: string): string {
  const priceToTier: Record<string, string> = {
    [process.env.STRIPE_STARTER_PRICE_ID || '']: 'STARTER',
    [process.env.STRIPE_PROFESSIONAL_PRICE_ID || '']: 'PROFESSIONAL',
    [process.env.STRIPE_ENTERPRISE_PRICE_ID || '']: 'ENTERPRISE',
  };
  return priceToTier[priceId] || 'STARTER';
}

export default router;
