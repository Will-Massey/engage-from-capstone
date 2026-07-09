/**
 * Post-sign payment collection — Stripe Connect destination charges only.
 */

import { prisma } from '../config/database.js';
import logger from '../config/logger.js';
import { stripe } from '../config/stripe.js';
import { getPaymentSettings } from '../utils/tenantPaymentSettings.js';
import { tenantAppUrl } from '../config/urls.js';
import { isPayoutCollectionEnabled } from './payoutSettingsService.js';
import { getOrCreateConnectedAccount, isCollectionReady } from './stripeConnectService.js';
import { createStripeProposalCheckout } from './proposalPaymentStripe.js';
import { buildFeePreview, resolvePlatformFeeBps } from '../lib/payments/splitCalculator.js';
import { CLIENT_PAYMENT_AUTH_VERSION } from '../constants/paymentAgreements.js';

export type PaymentProviderName = 'stripe' | 'none';

const PAYMENT_COMPLETE_STATUSES = ['ACTIVE', 'PAID', 'COMPLETED', 'SKIPPED'];

export interface MandateSetupOptions {
  preferredMethod?: 'card';
  paymentAuthAccepted?: boolean;
}

export interface MandateSetupResult {
  provider: PaymentProviderName;
  mandateId: string;
  paymentId?: string;
  checkoutUrl: string;
  status: string;
  isStub: boolean;
  token?: string;
  mode?: 'sandbox' | 'prod';
}

export function resolvePaymentProvider(): PaymentProviderName {
  if (stripe) return 'stripe';
  return 'none';
}

/** True when the proposal total warrants post-sign payment collection. */
export function proposalRequiresPayment(total: number): boolean {
  return total > 0;
}

export function isPaymentCollectionAvailable(): boolean {
  return resolvePaymentProvider() !== 'none';
}

function getFrontendBaseUrl(tenantSubdomain: string): string {
  return (process.env.PUBLIC_PROPOSAL_URL || tenantAppUrl(tenantSubdomain)).replace(/\/$/, '');
}

/**
 * Whether this tenant should offer payment collection after sign.
 * Requires payout opt-in, collectPaymentAtSign, Stripe configured, and Connect ready.
 */
export async function shouldCollectPaymentAtSign(tenantId: string): Promise<boolean> {
  const [payoutEnabled, ready, tenant] = await Promise.all([
    isPayoutCollectionEnabled(tenantId),
    isCollectionReady(tenantId),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }),
  ]);
  const settings = getPaymentSettings(tenant?.settings);
  return payoutEnabled && ready && settings.collectPaymentAtSign && isPaymentCollectionAvailable();
}

/**
 * Create a Stripe Connect Checkout Session after proposal acceptance.
 */
export async function createPostSignMandate(
  proposalId: string,
  options: MandateSetupOptions = {}
): Promise<MandateSetupResult> {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: {
      client: true,
      tenant: {
        select: {
          id: true,
          subdomain: true,
          settings: true,
          subscriptionTier: true,
          payoutSettings: true,
        },
      },
    },
  });

  if (!proposal) {
    throw new Error('Proposal not found');
  }

  if (proposal.status !== 'ACCEPTED') {
    throw new Error('Proposal must be accepted before setting up payment');
  }

  const payoutEnabled = await isPayoutCollectionEnabled(proposal.tenantId);
  if (!payoutEnabled) {
    throw new Error('This practice has not enabled payment collection through Engage');
  }

  if (!options.paymentAuthAccepted) {
    throw new Error('Client payment authorisation must be accepted before checkout');
  }

  const provider = resolvePaymentProvider();
  if (provider !== 'stripe') {
    throw new Error('Stripe payment collection is not configured');
  }

  const ready = await isCollectionReady(proposal.tenantId);
  if (!ready) {
    throw new Error('This practice has not completed Stripe onboarding');
  }

  const shareToken = proposal.shareToken;
  if (!shareToken) {
    throw new Error('Proposal share token missing — cannot create payment setup link');
  }

  const customerEmail = proposal.client.contactEmail;
  if (!customerEmail) {
    throw new Error('Client email is required for payment setup');
  }

  await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      paymentAuthAccepted: true,
      paymentAuthAcceptedAt: new Date(),
      paymentAuthVersion: CLIENT_PAYMENT_AUTH_VERSION,
    },
  });

  const connectedAccountId = await getOrCreateConnectedAccount(proposal.tenantId);
  const base = getFrontendBaseUrl(proposal.tenant.subdomain);
  const platformFeeBps = resolvePlatformFeeBps(
    proposal.tenant.subscriptionTier,
    proposal.tenant.payoutSettings?.platformFeeBpsOverride
  );

  const checkout = await createStripeProposalCheckout({
    proposalId: proposal.id,
    tenantId: proposal.tenantId,
    reference: proposal.reference,
    title: proposal.title,
    grossPence: Math.round((proposal.total ?? 0) * 100),
    connectedAccountId,
    platformFeeBps,
    customerEmail,
    successUrl: `${base}/proposals/view/${shareToken}?payment=success`,
    cancelUrl: `${base}/proposals/view/${shareToken}?payment=cancelled`,
  });

  await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      paymentMandateId: checkout.sessionId,
      paymentProvider: 'stripe',
      paymentMethod: options.preferredMethod || 'card',
      paymentUrl: checkout.checkoutUrl,
    },
  });

  await logPaymentActivity(proposal.tenantId, proposalId, 'PAYMENT_CHECKOUT_CREATED', {
    provider: 'stripe',
    sessionId: checkout.sessionId,
  });

  return {
    provider: 'stripe',
    mandateId: checkout.sessionId,
    paymentId: checkout.sessionId,
    checkoutUrl: checkout.checkoutUrl,
    status: 'PENDING',
    isStub: false,
  };
}

/**
 * Skip payment setup (client opts out — proposal remains signed).
 */
export async function skipPaymentSetup(proposalId: string): Promise<void> {
  await prisma.proposal.update({
    where: { id: proposalId },
    data: { paymentStatus: 'SKIPPED' },
  });
}

export interface PublicPaymentConfig {
  payoutEnabled: boolean;
  collectPaymentAtSign: boolean;
  paymentRequired: boolean;
  provider: PaymentProviderName;
  providerConfigured: boolean;
  methods: {
    card: boolean;
  };
  paymentStatus: string | null;
  paymentMandateId: string | null;
  checkoutUrl: string | null;
  feePreview: {
    grossPence: number;
    platformFeePence: number;
    processingFeePence: number;
    netToPracticePence: number;
    platformFeeBps: number;
  } | null;
  clientPaymentAuthVersion: string;
}

export async function getPublicPaymentConfig(
  proposalId: string,
  tenantId: string
): Promise<PublicPaymentConfig> {
  const [tenant, payoutSettings] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true, subscriptionTier: true },
    }),
    prisma.tenantPayoutSettings.findUnique({ where: { tenantId } }),
  ]);

  const paymentSettings = getPaymentSettings(tenant?.settings);
  const payoutEnabled = payoutSettings?.enabled === true;
  const provider = resolvePaymentProvider();

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: {
      status: true,
      total: true,
      paymentStatus: true,
      paymentMandateId: true,
      paymentUrl: true,
      paymentProvider: true,
    },
  });

  const collectPaymentAtSign = payoutEnabled && paymentSettings.collectPaymentAtSign;

  const paymentRequired =
    proposal?.status === 'ACCEPTED' &&
    collectPaymentAtSign &&
    (proposal.total ?? 0) > 0 &&
    !PAYMENT_COMPLETE_STATUSES.includes(proposal.paymentStatus || '');

  const grossPence = Math.round((proposal?.total ?? 0) * 100);
  const platformFeeBps = resolvePlatformFeeBps(
    tenant?.subscriptionTier,
    payoutSettings?.platformFeeBpsOverride
  );

  return {
    payoutEnabled,
    collectPaymentAtSign,
    paymentRequired: !!paymentRequired,
    provider,
    providerConfigured: provider === 'stripe',
    methods: {
      card: true,
    },
    paymentStatus: proposal?.paymentStatus || null,
    paymentMandateId: proposal?.paymentMandateId || null,
    checkoutUrl: proposal?.paymentUrl || null,
    feePreview:
      payoutEnabled && grossPence > 0 ? buildFeePreview(grossPence, platformFeeBps) : null,
    clientPaymentAuthVersion: CLIENT_PAYMENT_AUTH_VERSION,
  };
}

async function logPaymentActivity(
  tenantId: string,
  proposalId: string,
  action: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        tenantId,
        action,
        entityType: 'PROPOSAL',
        entityId: proposalId,
        proposalId,
        description: action.replace(/_/g, ' ').toLowerCase(),
        metadata: JSON.stringify(metadata),
      },
    });
  } catch (err) {
    logger.warn('Failed to log payment activity', err);
  }
}
