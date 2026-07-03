/**
 * Post-sign payment collection (Ignition-style).
 * Uses Revolut when configured; falls back to GoCardless stub gracefully.
 */

import { prisma } from '../config/database.js';
import logger from '../config/logger.js';
import { isRevolutConfigured } from '../lib/revolut/revolut-client.js';
import { createProposalCheckoutOrder } from './proposalPayment.js';
import { createMandateSetup, completeStubMandate } from './gocardlessStub.js';
import { getPaymentSettings } from '../utils/tenantPaymentSettings.js';
import { tenantAppUrl } from '../config/urls.js';

export type PaymentProviderName = 'revolut' | 'gocardless_stub' | 'none';

const PAYMENT_COMPLETE_STATUSES = ['ACTIVE', 'PAID', 'COMPLETED', 'SKIPPED'];

export interface MandateSetupOptions {
  allowCard?: boolean;
  allowDirectDebit?: boolean;
  preferredMethod?: 'direct_debit' | 'card';
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
  if (isRevolutConfigured()) return 'revolut';
  return 'gocardless_stub';
}

export function isPaymentCollectionAvailable(): boolean {
  return resolvePaymentProvider() !== 'none';
}

function getFrontendBaseUrl(tenantSubdomain: string): string {
  return (process.env.PUBLIC_PROPOSAL_URL || tenantAppUrl(tenantSubdomain)).replace(/\/$/, '');
}

/**
 * Whether this tenant should offer payment collection after sign.
 */
export async function shouldCollectPaymentAtSign(tenantId: string): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  const settings = getPaymentSettings(tenant?.settings);
  return settings.collectPaymentAtSign && isPaymentCollectionAvailable();
}

/**
 * Create a payment checkout / mandate session after proposal acceptance.
 */
export async function createPostSignMandate(
  proposalId: string,
  options: MandateSetupOptions = {}
): Promise<MandateSetupResult> {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: {
      client: true,
      tenant: { select: { id: true, subdomain: true, settings: true } },
    },
  });

  if (!proposal) {
    throw new Error('Proposal not found');
  }

  if (proposal.status !== 'ACCEPTED') {
    throw new Error('Proposal must be accepted before setting up payment');
  }

  const paymentSettings = getPaymentSettings(proposal.tenant.settings);
  const provider = resolvePaymentProvider();

  const shareToken = proposal.shareToken;

  if (!shareToken) {
    throw new Error('Proposal share token missing — cannot create payment setup link');
  }

  const customerName = proposal.client.contactName || proposal.client.name;
  const customerEmail = proposal.client.contactEmail;

  if (!customerEmail) {
    throw new Error('Client email is required for payment setup');
  }

  if (provider === 'revolut') {
    const checkout = await createProposalCheckoutOrder(
      {
        id: proposal.id,
        tenantId: proposal.tenantId,
        reference: proposal.reference,
        title: proposal.title,
        total: proposal.total,
        paymentStatus: proposal.paymentStatus,
        client: {
          name: proposal.client.name,
          contactName: proposal.client.contactName,
          contactEmail: proposal.client.contactEmail,
        },
      },
      { email: customerEmail, name: customerName },
      shareToken
    );

    if (!checkout) {
      throw new Error('Revolut checkout could not be created');
    }

    await prisma.proposal.update({
      where: { id: proposalId },
      data: {
        paymentMandateId: checkout.orderId,
        paymentProvider: 'revolut',
        paymentMethod: options.preferredMethod || 'revolut',
      },
    });

    await logPaymentActivity(proposal.tenantId, proposalId, 'PAYMENT_CHECKOUT_CREATED', {
      provider: 'revolut',
      orderId: checkout.orderId,
    });

    return {
      provider: 'revolut',
      mandateId: checkout.orderId,
      paymentId: checkout.orderId,
      checkoutUrl: checkout.checkoutUrl || '',
      status: 'PENDING',
      isStub: false,
      token: checkout.token,
      mode: checkout.mode,
    };
  }

  // GoCardless stub fallback
  const frontendBase = getFrontendBaseUrl(proposal.tenant.subdomain);
  const stub = await createMandateSetup(
    {
      proposalId: proposal.id,
      reference: proposal.reference,
      customer: {
        name: customerName,
        email: customerEmail,
        companyName: proposal.client.name,
      },
      metadata: {
        proposalId: proposal.id,
        tenantId: proposal.tenantId,
      },
    },
    frontendBase,
    shareToken
  );

  await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      paymentMandateId: stub.id,
      paymentProvider: 'gocardless_stub',
      paymentStatus: 'PENDING',
      paymentUrl: stub.redirectUrl,
      paymentMethod: options.preferredMethod || 'direct_debit',
    },
  });

  await logPaymentActivity(proposal.tenantId, proposalId, 'PAYMENT_MANDATE_CREATED', {
    provider: 'gocardless_stub',
    mandateId: stub.id,
    isStub: true,
  });

  return {
    provider: 'gocardless_stub',
    mandateId: stub.id,
    checkoutUrl: stub.redirectUrl,
    status: stub.status,
    isStub: true,
  };
}

/**
 * Complete a stub mandate (demo / dev flow when Revolut is not configured).
 */
export async function completeStubMandateForProposal(
  proposalId: string,
  mandateId: string
): Promise<{ status: string }> {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { paymentMandateId: true, paymentProvider: true, tenantId: true },
  });

  if (!proposal) {
    throw new Error('Proposal not found');
  }

  if (proposal.paymentProvider !== 'gocardless_stub') {
    throw new Error('Stub completion is only available for demo payment flow');
  }

  if (proposal.paymentMandateId !== mandateId) {
    throw new Error('Mandate ID does not match');
  }

  const result = completeStubMandate(mandateId);

  await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      paymentStatus: 'ACTIVE',
      paidAt: new Date(),
    },
  });

  await logPaymentActivity(proposal.tenantId, proposalId, 'PAYMENT_MANDATE_ACTIVATED', {
    provider: 'gocardless_stub',
    mandateId,
    isStub: true,
  });

  logger.info(`Stub mandate activated for proposal ${proposalId}: ${mandateId}`);

  return { status: result.status };
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
  collectPaymentAtSign: boolean;
  paymentRequired: boolean;
  provider: PaymentProviderName;
  providerConfigured: boolean;
  isStub: boolean;
  methods: {
    directDebit: boolean;
    card: boolean;
  };
  paymentStatus: string | null;
  paymentMandateId: string | null;
  checkoutUrl: string | null;
}

export async function getPublicPaymentConfig(
  proposalId: string,
  tenantId: string
): Promise<PublicPaymentConfig> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  const paymentSettings = getPaymentSettings(tenant?.settings);
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

  const paymentRequired =
    proposal?.status === 'ACCEPTED' &&
    paymentSettings.collectPaymentAtSign &&
    (proposal.total ?? 0) > 0 &&
    !PAYMENT_COMPLETE_STATUSES.includes(proposal.paymentStatus || '');

  return {
    collectPaymentAtSign: paymentSettings.collectPaymentAtSign,
    paymentRequired: !!paymentRequired,
    provider,
    providerConfigured: provider === 'revolut',
    isStub: provider === 'gocardless_stub',
    methods: {
      directDebit: paymentSettings.allowDirectDebit,
      card: paymentSettings.allowCard,
    },
    paymentStatus: proposal?.paymentStatus || null,
    paymentMandateId: proposal?.paymentMandateId || null,
    checkoutUrl: proposal?.paymentUrl || null,
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