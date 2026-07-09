import { prisma } from '../config/database.js';
import { PAYMENT_COLLECTION_TERMS_VERSION } from '../constants/paymentAgreements.js';
import { getPaymentSettings } from '../utils/tenantPaymentSettings.js';
import { resolvePlatformFeeBps } from '../lib/payments/splitCalculator.js';

export interface PayoutSettingsPublic {
  enabled: boolean;
  payoutMethod: string;
  accountHolderName: string | null;
  stripeConnectedAccountId: string | null;
  stripeTransfersStatus: string;
  verificationStatus: string;
  verifiedAt: string | null;
  consentVersion: string | null;
  consentAcceptedAt: string | null;
  platformFeeBps: number;
  collectPaymentAtSign: boolean;
}

export async function getOrCreatePayoutSettings(tenantId: string) {
  const existing = await prisma.tenantPayoutSettings.findUnique({ where: { tenantId } });
  if (existing) return existing;
  return prisma.tenantPayoutSettings.create({ data: { tenantId } });
}

export async function getPayoutSettingsPublic(tenantId: string): Promise<PayoutSettingsPublic> {
  const [settings, tenant] = await Promise.all([
    getOrCreatePayoutSettings(tenantId),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true, subscriptionTier: true },
    }),
  ]);

  const paymentPrefs = getPaymentSettings(tenant?.settings);
  const platformFeeBps = resolvePlatformFeeBps(
    tenant?.subscriptionTier,
    settings.platformFeeBpsOverride
  );

  return {
    enabled: settings.enabled,
    payoutMethod: settings.payoutMethod,
    accountHolderName: settings.accountHolderName,
    stripeConnectedAccountId: settings.stripeConnectedAccountId,
    stripeTransfersStatus: settings.stripeTransfersStatus,
    verificationStatus: settings.verificationStatus,
    verifiedAt: settings.verifiedAt?.toISOString() ?? null,
    consentVersion: settings.consentVersion,
    consentAcceptedAt: settings.consentAcceptedAt?.toISOString() ?? null,
    platformFeeBps,
    collectPaymentAtSign: paymentPrefs.collectPaymentAtSign,
  };
}

export async function isPayoutCollectionEnabled(tenantId: string): Promise<boolean> {
  const settings = await prisma.tenantPayoutSettings.findUnique({
    where: { tenantId },
    select: { enabled: true },
  });
  return settings?.enabled === true;
}

/**
 * Enable/disable payment collection. With Stripe Connect the practice's bank +
 * identity are collected by Stripe-hosted onboarding, so enabling requires only
 * accepted terms AND an active stripe_transfers capability.
 */
export async function savePayoutSettings({
  tenantId,
  userId,
  enabled,
  consentAccepted,
  consentVersion,
  consentIp,
  payoutMethod,
  accountHolderName,
}: {
  tenantId: string;
  userId: string;
  enabled?: boolean;
  consentAccepted?: boolean;
  consentVersion?: string;
  consentIp?: string | null;
  payoutMethod?: string;
  accountHolderName?: string;
}) {
  const current = await getOrCreatePayoutSettings(tenantId);

  const data: Record<string, unknown> = {};

  if (payoutMethod !== undefined) data.payoutMethod = payoutMethod;
  if (accountHolderName !== undefined) data.accountHolderName = accountHolderName;

  if (enabled === true) {
    if (!consentAccepted || consentVersion !== PAYMENT_COLLECTION_TERMS_VERSION) {
      throw new Error('Payment Collection Terms must be accepted before enabling payouts');
    }
    if (current.stripeTransfersStatus !== 'active') {
      throw new Error('Finish Stripe onboarding before enabling payment collection');
    }

    data.enabled = true;
    data.enabledAt = new Date();
    data.enabledByUserId = userId;
    data.consentVersion = consentVersion;
    data.consentAcceptedAt = new Date();
    data.consentIp = consentIp ?? null;
  } else if (enabled === false) {
    data.enabled = false;
  }

  return prisma.tenantPayoutSettings.update({
    where: { tenantId },
    data,
  });
}
