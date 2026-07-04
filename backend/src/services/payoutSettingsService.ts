import { prisma } from '../config/database.js';
import { encrypt } from '../utils/encryption.js';
import { validateUkBankDetails, maskAccountLast4 } from '../utils/ukBankValidation.js';
import { PAYMENT_COLLECTION_TERMS_VERSION } from '../constants/paymentAgreements.js';
import { createCounterpartyFromBankDetails } from '../lib/revolut/business-client.js';
import { getPaymentSettings } from '../utils/tenantPaymentSettings.js';
import { resolvePlatformFeeBps } from '../lib/payments/splitCalculator.js';

export interface PayoutSettingsPublic {
  enabled: boolean;
  allowRevolutPay: boolean;
  allowCard: boolean;
  payoutMethod: string;
  accountHolderName: string | null;
  bankDetailsLast4: string | null;
  revolutCounterpartyId: string | null;
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
    settings.platformFeeBpsOverride,
  );

  return {
    enabled: settings.enabled,
    allowRevolutPay: settings.allowRevolutPay,
    allowCard: settings.allowCard,
    payoutMethod: settings.payoutMethod,
    accountHolderName: settings.accountHolderName,
    bankDetailsLast4: settings.bankDetailsLast4,
    revolutCounterpartyId: settings.revolutCounterpartyId,
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

export async function savePayoutSettings({
  tenantId,
  userId,
  enabled,
  consentAccepted,
  consentVersion,
  consentIp,
  allowRevolutPay,
  allowCard,
  payoutMethod,
  accountHolderName,
  sortCode,
  accountNumber,
  revolutCounterpartyId,
}: {
  tenantId: string;
  userId: string;
  enabled?: boolean;
  consentAccepted?: boolean;
  consentVersion?: string;
  consentIp?: string | null;
  allowRevolutPay?: boolean;
  allowCard?: boolean;
  payoutMethod?: string;
  accountHolderName?: string;
  sortCode?: string;
  accountNumber?: string;
  revolutCounterpartyId?: string;
}) {
  const current = await getOrCreatePayoutSettings(tenantId);
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, settings: true },
  });
  if (!tenant) throw new Error('Tenant not found');

  const data: Record<string, unknown> = {};

  if (allowRevolutPay !== undefined) data.allowRevolutPay = allowRevolutPay;
  if (allowCard !== undefined) data.allowCard = allowCard;
  if (payoutMethod !== undefined) data.payoutMethod = payoutMethod;
  if (accountHolderName !== undefined) data.accountHolderName = accountHolderName;

  if (enabled === true) {
    if (!consentAccepted || consentVersion !== PAYMENT_COLLECTION_TERMS_VERSION) {
      throw new Error('Payment Collection Terms must be accepted before enabling payouts');
    }

    const method = payoutMethod ?? current.payoutMethod;
    let counterpartyId = revolutCounterpartyId ?? current.revolutCounterpartyId;

    if (method === 'REVOLUT_COUNTERPARTY') {
      if (!counterpartyId) {
        throw new Error('Revolut counterparty ID is required for Revolut-to-Revolut payouts');
      }
    } else if (sortCode && accountNumber) {
      const validation = validateUkBankDetails(sortCode, accountNumber);
      if (!validation.ok) throw new Error(validation.message || 'Invalid bank details');

      const encrypted = encrypt(
        JSON.stringify({
          sortCode: sortCode.replace(/\D/g, ''),
          accountNumber: accountNumber.replace(/\D/g, ''),
        }),
      );

      counterpartyId = await createCounterpartyFromBankDetails({
        companyName: accountHolderName || tenant.name,
        sortCode: sortCode.replace(/\D/g, ''),
        accountNumber: accountNumber.replace(/\D/g, ''),
      });

      data.bankDetailsEncrypted = encrypted;
      data.bankDetailsLast4 = maskAccountLast4(accountNumber);
      data.revolutCounterpartyId = counterpartyId;
      data.verificationStatus = 'PENDING';
      data.firstPayoutHeldUntil = new Date(Date.now() + 48 * 60 * 60 * 1000);
    } else if (!current.revolutCounterpartyId && !counterpartyId) {
      throw new Error('UK bank details or a Revolut counterparty ID is required to enable payouts');
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

  const effectiveMethod = payoutMethod ?? current.payoutMethod;
  if (revolutCounterpartyId && methodAllowsCounterparty(effectiveMethod)) {
    data.revolutCounterpartyId = revolutCounterpartyId;
  }

  return prisma.tenantPayoutSettings.update({
    where: { tenantId },
    data,
  });
}

function methodAllowsCounterparty(method: string): boolean {
  return method === 'REVOLUT_COUNTERPARTY' || method === 'UK_BANK_TRANSFER';
}