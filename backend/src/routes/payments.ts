import { Router } from 'express';
import type Stripe from 'stripe';
import { z } from 'zod';
import { stripe, SUBSCRIPTION_TIERS } from '../config/stripe.js';
import { prisma } from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { evaluateTenantBilling, getTrialEndsAt } from '../services/subscriptionService.js';

const router = Router();

// Assert Stripe is configured. Assertion signature so a single call narrows
// the module-level `stripe` from `Stripe | null` to `Stripe` for the rest of
// the handler — the runtime guard and the type guard are now the same check.
function checkStripe(client: typeof stripe): asserts client is Stripe {
  if (!client) {
    throw new ApiError(
      'STRIPE_NOT_CONFIGURED',
      'Payments are not configured. Please contact support.',
      503
    );
  }
}

/**
 * GET /api/payments/config
 * Get Stripe publishable key and configuration
 */
router.get(
  '/config',
  authenticate,
  asyncHandler(async (req, res) => {
    const stripeEnabled = !!stripe && !!process.env.STRIPE_PUBLISHABLE_KEY;

    res.json({
      success: true,
      data: {
        isEnabled: stripeEnabled,
        provider: stripeEnabled ? 'stripe' : null,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
        mode: 'prod',
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
    checkStripe(stripe);
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
    const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    // Set as default payment method, and copy the billing address onto the
    // customer so Stripe Tax can determine the jurisdiction and add UK VAT.
    const billingAddress = paymentMethod.billing_details?.address;
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
      ...(billingAddress ? { address: billingAddress as Stripe.AddressParam } : {}),
    });

    // Create subscription. Prices are net; Stripe Tax adds VAT automatically
    // once a UK registration is active (Dashboard → Tax → Registrations).
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      automatic_tax: { enabled: true },
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
    checkStripe(stripe);
    const tenantId = req.tenantId!;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { stripeSubscriptionId: true },
    });

    if (!tenant?.stripeSubscriptionId) {
      throw new ApiError('NO_SUBSCRIPTION', 'No active subscription found', 400);
    }

    // Cancel at period end
    const subscription = (await stripe.subscriptions.update(tenant.stripeSubscriptionId, {
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
    checkStripe(stripe);
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
    checkStripe(stripe);
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

/**
 * GET /api/payments/dunning-queue
 * Failed recurring payments + unpaid accepted proposals (collection board).
 */
router.get(
  '/dunning-queue',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const [failedLogs, unpaidAccepted] = await Promise.all([
      prisma.activityLog.findMany({
        where: {
          tenantId,
          action: 'RECURRING_PAYMENT_FAILED',
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          entityId: true,
          proposalId: true,
          metadata: true,
          createdAt: true,
          description: true,
        },
      }),
      prisma.proposal.findMany({
        where: {
          tenantId,
          status: 'ACCEPTED',
          OR: [
            { paymentStatus: null },
            {
              paymentStatus: {
                notIn: ['PAID', 'COMPLETED', 'ACTIVE'],
              },
            },
          ],
          stripeSubscriptionId: null,
        },
        select: {
          id: true,
          reference: true,
          title: true,
          totalPence: true,
          paymentStatus: true,
          acceptedAt: true,
          client: { select: { id: true, name: true, contactEmail: true } },
        },
        take: 40,
        orderBy: { acceptedAt: 'desc' },
      }),
    ]);

    const proposalIds = [
      ...new Set(
        failedLogs.map((l) => l.proposalId || l.entityId).filter((id): id is string => !!id)
      ),
    ];
    const proposals = proposalIds.length
      ? await prisma.proposal.findMany({
          where: { id: { in: proposalIds }, tenantId },
          select: {
            id: true,
            reference: true,
            title: true,
            totalPence: true,
            stripeSubscriptionId: true,
            paymentStatus: true,
            client: { select: { id: true, name: true, contactEmail: true } },
          },
        })
      : [];
    const byId = Object.fromEntries(proposals.map((p) => [p.id, p]));

    const failed = failedLogs.map((log) => {
      let meta: Record<string, unknown> = {};
      try {
        meta = JSON.parse(log.metadata || '{}');
      } catch {
        /* ignore */
      }
      const pid = log.proposalId || log.entityId || '';
      const p = byId[pid];
      return {
        kind: 'recurring_failed' as const,
        logId: log.id,
        proposalId: pid || null,
        reference: p?.reference || null,
        title: p?.title || null,
        clientName: p?.client.name || null,
        clientId: p?.client.id || null,
        contactEmail: p?.client.contactEmail || null,
        amountPence: typeof meta.amountDue === 'number' ? meta.amountDue : p?.totalPence || 0,
        invoiceId: typeof meta.invoiceId === 'string' ? meta.invoiceId : null,
        subscriptionId:
          typeof meta.subscriptionId === 'string'
            ? meta.subscriptionId
            : p?.stripeSubscriptionId || null,
        failedAt: log.createdAt.toISOString(),
        billingPortalAvailable: Boolean(p?.stripeSubscriptionId || meta.subscriptionId),
      };
    });

    const unpaid = unpaidAccepted.map((p) => ({
      kind: 'unpaid_accepted' as const,
      logId: null as string | null,
      proposalId: p.id,
      reference: p.reference,
      title: p.title,
      clientName: p.client.name,
      clientId: p.client.id,
      contactEmail: p.client.contactEmail,
      amountPence: p.totalPence,
      invoiceId: null as string | null,
      subscriptionId: null as string | null,
      failedAt: p.acceptedAt?.toISOString() || null,
      billingPortalAvailable: false,
      paymentStatus: p.paymentStatus,
    }));

    res.json({
      success: true,
      data: {
        failed,
        unpaid,
        totals: {
          failedCount: failed.length,
          unpaidCount: unpaid.length,
          failedPence: failed.reduce((s, f) => s + (f.amountPence || 0), 0),
          unpaidPence: unpaid.reduce((s, u) => s + u.amountPence, 0),
        },
      },
    });
  })
);

/**
 * POST /api/payments/proposals/:id/billing-portal
 * Staff-initiated Stripe customer portal (card update / invoices).
 */
router.post(
  '/proposals/:id/billing-portal',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const proposal = await prisma.proposal.findFirst({
      where: { id: req.params.id, tenantId },
      select: { id: true, stripeSubscriptionId: true, reference: true },
    });
    if (!proposal) throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
    if (!proposal.stripeSubscriptionId) {
      throw new ApiError('NO_SUBSCRIPTION', 'No live Stripe subscription on this proposal', 400);
    }

    const { createProposalBillingPortal } = await import('../services/paymentCollection.js');
    const url = await createProposalBillingPortal(proposal.id);
    if (!url) {
      throw new ApiError(
        'PORTAL_UNAVAILABLE',
        'Could not create billing portal (Stripe not configured or no customer)',
        503
      );
    }

    await prisma.activityLog.create({
      data: {
        tenantId,
        action: 'DUNNING_PORTAL_OPENED',
        entityType: 'Proposal',
        entityId: proposal.id,
        proposalId: proposal.id,
        description: `Billing portal link created for ${proposal.reference}`,
        metadata: JSON.stringify({ by: req.user?.id }),
        userId: req.user?.id,
      },
    });

    res.json({ success: true, data: { url, proposalId: proposal.id } });
  })
);

/**
 * POST /api/payments/proposals/:id/dunning-retry
 * Attempt invoice.pay when invoiceId known; always logs retry + optional portal URL.
 */
router.post(
  '/proposals/:id/dunning-retry',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER', 'MD'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const invoiceId = typeof req.body?.invoiceId === 'string' ? req.body.invoiceId : null;

    const proposal = await prisma.proposal.findFirst({
      where: { id: req.params.id, tenantId },
      select: {
        id: true,
        reference: true,
        stripeSubscriptionId: true,
        client: { select: { contactEmail: true, name: true } },
      },
    });
    if (!proposal) throw new ApiError('NOT_FOUND', 'Proposal not found', 404);

    let payResult: 'paid' | 'failed' | 'skipped' = 'skipped';
    let payError: string | null = null;

    if (invoiceId && stripe) {
      try {
        const inv = await stripe.invoices.pay(invoiceId);
        payResult = inv.status === 'paid' ? 'paid' : 'failed';
        if (inv.status !== 'paid') {
          payError = inv.status || 'not paid';
        }
      } catch (e: any) {
        payResult = 'failed';
        payError = e?.message || 'invoice.pay failed';
      }
    }

    let portalUrl: string | null = null;
    if (proposal.stripeSubscriptionId) {
      try {
        const { createProposalBillingPortal } = await import('../services/paymentCollection.js');
        portalUrl = await createProposalBillingPortal(proposal.id);
      } catch {
        portalUrl = null;
      }
    }

    await prisma.activityLog.create({
      data: {
        tenantId,
        action: 'DUNNING_RETRY',
        entityType: 'Proposal',
        entityId: proposal.id,
        proposalId: proposal.id,
        description: `Dunning retry on ${proposal.reference}: ${payResult}`,
        metadata: JSON.stringify({
          invoiceId,
          payResult,
          payError,
          portalUrl: portalUrl ? true : false,
          by: req.user?.id,
        }),
        userId: req.user?.id,
      },
    });

    res.json({
      success: true,
      data: {
        proposalId: proposal.id,
        reference: proposal.reference,
        payResult,
        payError,
        portalUrl,
        clientEmail: proposal.client.contactEmail,
        message:
          payResult === 'paid'
            ? 'Invoice paid successfully'
            : portalUrl
              ? 'Share the billing portal link so the client can update their card'
              : payError || 'Retry logged — no live invoice/subscription available to charge',
      },
    });
  })
);

export default router;
