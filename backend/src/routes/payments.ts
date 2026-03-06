import { Router } from 'express';
import express from 'express';
import { z } from 'zod';
import { stripe, SUBSCRIPTION_TIERS } from '../config/stripe.js';
import { prisma } from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

const router = Router();

// Helper to check if Stripe is configured
const checkStripe = () => {
  if (!stripe) {
    throw new ApiError('STRIPE_NOT_CONFIGURED', 'Payments are not configured. Please contact support.', 503);
  }
};

/**
 * GET /api/payments/config
 * Get Stripe publishable key
 */
router.get(
  '/config',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: {
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
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
  authorize('PARTNER'),
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
    checkStripe();
    const tenantId = req.tenantId!;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        stripeSubscriptionId: true,
        subscriptionStatus: true,
        subscriptionTier: true,
        stripeCustomerId: true,
      },
    });

    if (!tenant?.stripeSubscriptionId) {
      return res.json({
        success: true,
        data: {
          hasSubscription: false,
          tier: null,
          status: null,
        },
      });
    }

    // Get subscription details from Stripe
    const subscription = await stripe!.subscriptions.retrieve(
      tenant.stripeSubscriptionId
    ) as any;

    res.json({
      success: true,
      data: {
        hasSubscription: true,
        tier: tenant.subscriptionTier,
        status: subscription.status,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
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
  authorize('PARTNER'),
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
    const subscription = await stripe!.subscriptions.update(
      tenant.stripeSubscriptionId,
      { cancel_at_period_end: true }
    ) as any;

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
  authorize('PARTNER'),
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
    const subscription = await stripe.subscriptions.update(
      tenant.stripeSubscriptionId,
      { cancel_at_period_end: false }
    );

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
  authorize('PARTNER'),
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

/**
 * POST /api/payments/webhook
 * Handle Stripe webhooks
 */
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    checkStripe();
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !endpointSecret) {
      throw new ApiError('INVALID_WEBHOOK', 'Invalid webhook configuration', 400);
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err: any) {
      console.error(`Webhook signature verification failed: ${err.message}`);
      throw new ApiError('INVALID_SIGNATURE', 'Invalid signature', 400);
    }

    // Handle events
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

// Helper functions
function getTierFromPriceId(priceId: string): string {
  // Map price IDs to tier names
  const priceToTier: Record<string, string> = {
    [process.env.STRIPE_STARTER_PRICE_ID || '']: 'STARTER',
    [process.env.STRIPE_PROFESSIONAL_PRICE_ID || '']: 'PROFESSIONAL',
    [process.env.STRIPE_ENTERPRISE_PRICE_ID || '']: 'ENTERPRISE',
  };
  return priceToTier[priceId] || 'STARTER';
}

async function handlePaymentSucceeded(invoice: any) {
  const customerId = invoice.customer;
  
  // Update tenant payment status
  await prisma.tenant.updateMany({
    where: { stripeCustomerId: customerId },
    data: { 
      lastPaymentStatus: 'succeeded',
      lastPaymentDate: new Date(),
    },
  });
}

async function handlePaymentFailed(invoice: any) {
  const customerId = invoice.customer;
  
  await prisma.tenant.updateMany({
    where: { stripeCustomerId: customerId },
    data: { 
      lastPaymentStatus: 'failed',
      subscriptionStatus: 'past_due',
    },
  });
}

async function handleSubscriptionDeleted(subscription: any) {
  const customerId = subscription.customer;
  
  await prisma.tenant.updateMany({
    where: { stripeCustomerId: customerId },
    data: { 
      subscriptionStatus: 'cancelled',
      subscriptionTier: null,
      stripeSubscriptionId: null,
    },
  });
}

async function handleSubscriptionUpdated(subscription: any) {
  const customerId = subscription.customer;
  
  await prisma.tenant.updateMany({
    where: { stripeCustomerId: customerId },
    data: { 
      subscriptionStatus: subscription.status,
    },
  });
}

export default router;
