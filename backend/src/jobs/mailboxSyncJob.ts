/**
 * Scheduled two-way mailbox delta sync (every MAILBOX_SYNC_INTERVAL_MS,
 * default 10 min — see backend/src/app/jobs.ts for the setInterval wiring).
 *
 * Iterates tenants whose settings.email.provider is Gmail/Outlook/Microsoft365
 * and runs syncMailbox per tenant, sequential with a per-tenant try/catch so
 * one broken mailbox never blocks the rest. For Graph-connected tenants it
 * also renews the Graph webhook subscription when it's missing or within an
 * hour of expiring — webhooks are an accelerator, this scheduled sync remains
 * the guarantee, so a renewal failure is logged and never fatal.
 */
import { prisma } from '../config/database.js';
import logger from '../config/logger.js';
import { syncMailbox, normalizeMailProvider } from '../services/mailboxService.js';
import { ensureGraphSubscription } from '../services/mail/graphMailClient.js';

const SUBSCRIPTION_RENEW_MARGIN_MS = 60 * 60 * 1000; // 1 hour

export interface MailboxSyncJobResult {
  tenantsSynced: number;
}

interface MailTenant {
  id: string;
  provider: 'GMAIL' | 'OUTLOOK' | 'MICROSOFT365';
}

async function findMailTenants(): Promise<MailTenant[]> {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true, settings: true },
  });

  const mailTenants: MailTenant[] = [];
  for (const t of tenants) {
    try {
      const settings = JSON.parse(t.settings || '{}');
      const provider = normalizeMailProvider(settings?.email?.provider);
      if (provider) mailTenants.push({ id: t.id, provider });
    } catch {
      // malformed settings JSON — skip this tenant, never blocks the rest
    }
  }
  return mailTenants;
}

async function renewGraphSubscriptionIfNeeded(tenantId: string): Promise<void> {
  try {
    const syncState = await prisma.mailboxSyncState.findUnique({ where: { tenantId } });
    const expiry = syncState?.subscriptionExpiry;
    const needsRenewal = !expiry || expiry.getTime() < Date.now() + SUBSCRIPTION_RENEW_MARGIN_MS;
    if (!needsRenewal) return;

    const result = await ensureGraphSubscription(tenantId);
    if (!result.ok) {
      logger.warn(
        `Mailbox sync job: Graph subscription renewal failed for tenant ${tenantId}: ${result.error}`
      );
    }
  } catch (e) {
    logger.warn(`Mailbox sync job: Graph subscription check failed for tenant ${tenantId}`, e);
  }
}

export async function runMailboxSyncJob(): Promise<MailboxSyncJobResult> {
  if (process.env.EMAIL_DEV_LOG === 'true') {
    logger.info('Mailbox sync job skipped — EMAIL_DEV_LOG=true');
    return { tenantsSynced: 0 };
  }

  const mailTenants = await findMailTenants();

  for (const tenant of mailTenants) {
    try {
      await syncMailbox(tenant.id);
    } catch (e) {
      logger.error(`Mailbox sync job: sync failed for tenant ${tenant.id}`, e);
    }

    if (tenant.provider === 'OUTLOOK' || tenant.provider === 'MICROSOFT365') {
      await renewGraphSubscriptionIfNeeded(tenant.id);
    }
  }

  return { tenantsSynced: mailTenants.length };
}
