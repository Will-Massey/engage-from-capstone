import { prisma } from '../config/database.js';
import {
  createRecipientAccount,
  createOnboardingLink,
  getTransfersStatus,
} from '../lib/stripe/connect.js';
import { getOrCreatePayoutSettings } from './payoutSettingsService.js';

export async function getOrCreateConnectedAccount(tenantId: string): Promise<string> {
  const settings = await getOrCreatePayoutSettings(tenantId);
  if (settings.stripeConnectedAccountId) return settings.stripeConnectedAccountId;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, users: { take: 1, select: { email: true } } },
  });

  const { id } = await createRecipientAccount({
    country: 'gb',
    email: tenant?.users?.[0]?.email,
    businessName: tenant?.name ?? undefined,
  });

  await prisma.tenantPayoutSettings.update({
    where: { tenantId },
    data: { stripeConnectedAccountId: id, payoutMethod: 'STRIPE_CONNECT' },
  });

  return id;
}

export async function startOnboarding(
  tenantId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<{ url: string }> {
  const accountId = await getOrCreateConnectedAccount(tenantId);
  return createOnboardingLink(accountId, returnUrl, refreshUrl);
}

export async function syncTransfersStatus(accountId: string): Promise<void> {
  const status = await getTransfersStatus(accountId);
  await prisma.tenantPayoutSettings.updateMany({
    where: { stripeConnectedAccountId: accountId },
    data: { stripeTransfersStatus: status },
  });
}

export async function isCollectionReady(tenantId: string): Promise<boolean> {
  const s = await prisma.tenantPayoutSettings.findUnique({
    where: { tenantId },
    select: { stripeTransfersStatus: true },
  });
  return s?.stripeTransfersStatus === 'active';
}
