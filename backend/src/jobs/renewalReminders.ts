/**
 * Renewal Reminder Background Job
 * Sends email notifications 30 days before proposal renewal dates
 */

import { prisma } from '../config/database.js';
import { tenantMailer } from '../services/tenantMailer.js';
import logger from '../config/logger.js';
import { getProposalSettings } from '../utils/tenantProposalSettings.js';

const DEFAULT_REMINDER_DAYS = 30;

/** Logged once per proposal when the valid-until reminder is emailed */
const VALID_UNTIL_REMINDER_ACTION = 'PROPOSAL_VALID_UNTIL_REMINDER';

/**
 * True when the proposal is not purely one-off (payment + every line ONE_TIME).
 * One-off-only proposals skip the valid-until expiry reminder.
 */
export function proposalHasRecurringEngagement(proposal: {
  paymentFrequency: string;
  services: Array<{ billingFrequency: string }>;
}): boolean {
  if (proposal.paymentFrequency !== 'ONE_TIME') {
    return true;
  }
  if (!proposal.services.length) {
    return true;
  }
  return proposal.services.some((s) => s.billingFrequency !== 'ONE_TIME');
}

function reminderWindow(reminderDays: number) {
  const now = new Date();
  const reminderDate = new Date();
  reminderDate.setDate(now.getDate() + reminderDays);

  const startOfDay = new Date(reminderDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(reminderDate);
  endOfDay.setHours(23, 59, 59, 999);
  return { startOfDay, endOfDay, reminderDays };
}

async function findValidUntilRemindersDue() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, settings: true } });
  type ValidUntilRow = Awaited<
    ReturnType<
      typeof prisma.proposal.findMany<{
        include: {
          services: { select: { billingFrequency: true } };
          client: { select: { name: true } };
          createdBy: { select: { email: true } };
          tenant: { select: { id: true; name: true } };
          activityLogs: true;
        };
      }>
    >
  >[number];

  const results: ValidUntilRow[] = [];

  for (const tenant of tenants) {
    const { renewalReminderDays } = getProposalSettings(tenant.settings);
    const { startOfDay, endOfDay } = reminderWindow(renewalReminderDays);

    const proposals = await prisma.proposal.findMany({
      where: {
        tenantId: tenant.id,
        status: { in: ['SENT', 'VIEWED'] },
        validUntil: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        services: { select: { billingFrequency: true } },
        client: { select: { name: true } },
        createdBy: { select: { email: true } },
        tenant: { select: { id: true, name: true } },
        activityLogs: {
          where: { action: VALID_UNTIL_REMINDER_ACTION },
          take: 1,
        },
      },
    });

    results.push(
      ...proposals.filter(
        (p) => p.activityLogs.length === 0 && proposalHasRecurringEngagement(p)
      )
    );
  }

  return results;
}

async function sendValidUntilReminder(
  proposal: Awaited<ReturnType<typeof findValidUntilRemindersDue>>[number]
): Promise<boolean> {
  try {
    if (!proposal.createdBy?.email) {
      logger.warn(`No email for proposal creator: ${proposal.id}`);
      return false;
    }

    const validDate = new Date(proposal.validUntil).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const subject = `Proposal ${proposal.reference} expires in about one month`;
    const html = `
      <p>Hello,</p>
      <p>This is a reminder that proposal <strong>${proposal.title}</strong> (${proposal.reference}) for client <strong>${proposal.client.name}</strong> reaches its <strong>valid until</strong> date on <strong>${validDate}</strong> (in approximately one month).</p>
      <p>If the client has not yet signed, you may want to follow up.</p>
      <p>Regards,<br/>${proposal.tenant.name}</p>
    `;
    const text = `Proposal ${proposal.reference} (${proposal.title}) for ${proposal.client.name} is valid until ${validDate}. Follow up if still pending.`;

    const result = await tenantMailer.send({
      tenantId: proposal.tenantId,
      messageType: 'RENEWAL',
      message: {
        to: proposal.createdBy.email,
        subject,
        html,
        text,
      },
      relatedIds: { proposalId: proposal.id, clientId: proposal.clientId },
    });

    if (result.success) {
      await prisma.activityLog.create({
        data: {
          tenantId: proposal.tenantId,
          action: VALID_UNTIL_REMINDER_ACTION,
          entityType: 'PROPOSAL',
          entityId: proposal.id,
          proposalId: proposal.id,
          description: `Valid-until reminder for proposal ${proposal.reference}`,
        },
      });

      logger.info(`Valid-until reminder sent for proposal ${proposal.reference}`);
      return true;
    }

    logger.error(`Failed to send valid-until reminder: ${result.error}`);
    return false;
  } catch (error) {
    logger.error(`Error sending valid-until reminder for ${proposal.id}:`, error);
    return false;
  }
}

/**
 * Find proposals with renewals due in the reminder window
 */
async function findRenewalsDue(): Promise<
  Array<{
    id: string;
    reference: string;
    title: string;
    renewalDate: Date;
    acceptedAt: Date;
    total: number;
    client: { name: string };
    createdBy: { email: string | null };
    tenant: { id: string; name: string };
    reminderDays: number;
  }>
> {
  const tenants = await prisma.tenant.findMany({ select: { id: true, settings: true } });
  const all: Array<any> = [];

  for (const tenant of tenants) {
    const { renewalReminderDays } = getProposalSettings(tenant.settings);
    const { startOfDay, endOfDay } = reminderWindow(renewalReminderDays);

    const proposals = await prisma.proposal.findMany({
      where: {
        tenantId: tenant.id,
        status: 'ACCEPTED',
        renewalDate: { gte: startOfDay, lte: endOfDay },
        renewalReminderSent: false,
      },
      include: {
        client: { select: { name: true } },
        createdBy: { select: { email: true } },
        tenant: { select: { id: true, name: true } },
      },
    });

    for (const p of proposals) {
      all.push({ ...p, reminderDays: renewalReminderDays });
    }
  }

  return all as any;
}

/**
 * Calculate renewal date based on acceptance date
 * Sets renewal to 12 months from acceptance
 */
export function calculateRenewalDate(acceptedAt: Date): Date {
  const renewalDate = new Date(acceptedAt);
  renewalDate.setFullYear(renewalDate.getFullYear() + 1);
  return renewalDate;
}

/**
 * Update proposals that don't have renewal dates set
 * (migration for existing proposals)
 */
async function updateMissingRenewalDates(): Promise<number> {
  const proposals = await prisma.proposal.findMany({
    where: {
      status: 'ACCEPTED',
      renewalDate: null,
      acceptedAt: { not: null },
    },
    select: { id: true, acceptedAt: true },
  });

  let updated = 0;
  for (const proposal of proposals) {
    if (proposal.acceptedAt) {
      const renewalDate = calculateRenewalDate(proposal.acceptedAt);
      await prisma.proposal.update({
        where: { id: proposal.id },
        data: { renewalDate },
      });
      updated++;
    }
  }

  if (updated > 0) {
    logger.info(`Updated ${updated} proposals with missing renewal dates`);
  }

  return updated;
}

/**
 * Send renewal reminder for a single proposal
 */
async function sendRenewalReminder(
  proposal: Awaited<ReturnType<typeof findRenewalsDue>>[0]
): Promise<boolean> {
  try {
    if (!proposal.createdBy?.email) {
      logger.warn(`No email for proposal creator: ${proposal.id}`);
      return false;
    }

    const { generateRenewalReminder } = await import('../templates/renewalReminder.js');
    const { html, text, subject } = generateRenewalReminder({
      clientName: proposal.client.name,
      proposalTitle: proposal.title,
      proposalReference: proposal.reference,
      renewalDate: proposal.renewalDate,
      originalAcceptedAt: proposal.acceptedAt,
      totalAmount: `£${proposal.total.toFixed(2)}`,
      daysUntilRenewal: proposal.reminderDays ?? DEFAULT_REMINDER_DAYS,
      tenantName: proposal.tenant.name,
    });

    const result = await tenantMailer.send({
      tenantId: proposal.tenant.id,
      messageType: 'RENEWAL',
      message: {
        to: proposal.createdBy.email,
        subject,
        html,
        text,
      },
      relatedIds: { proposalId: proposal.id },
    });

    if (result.success) {
      // Mark reminder as sent
      await prisma.proposal.update({
        where: { id: proposal.id },
        data: {
          renewalReminderSent: true,
          renewalReminderSentAt: new Date(),
        },
      });

      logger.info(`Renewal reminder sent for proposal ${proposal.reference}`);
      return true;
    } else {
      logger.error(`Failed to send renewal reminder: ${result.error}`);
      return false;
    }
  } catch (error) {
    logger.error(`Error sending renewal reminder for ${proposal.id}:`, error);
    return false;
  }
}

/**
 * Main job function - run daily
 */
export async function runRenewalReminders(): Promise<{
  checked: number;
  sent: number;
  errors: number;
  expiryChecked: number;
  expirySent: number;
  expiryErrors: number;
}> {
  logger.info('Running renewal reminder job...');

  const stats = {
    checked: 0,
    sent: 0,
    errors: 0,
    expiryChecked: 0,
    expirySent: 0,
    expiryErrors: 0,
  };

  try {
    // Update any proposals missing renewal dates
    await updateMissingRenewalDates();

    // Find renewals due
    const renewalsDue = await findRenewalsDue();
    stats.checked = renewalsDue.length;

    logger.info(`Found ${renewalsDue.length} proposals with renewals due (per-tenant reminder window)`);

    // Send reminders
    for (const proposal of renewalsDue) {
      const success = await sendRenewalReminder(proposal);
      if (success) {
        stats.sent++;
      } else {
        stats.errors++;
      }
    }

    // Valid-until (proposal expiry) — ~1 month before validUntil, practice owner email, skip pure one-off
    const expiryDue = await findValidUntilRemindersDue();
    stats.expiryChecked = expiryDue.length;
    logger.info(
      `Found ${expiryDue.length} proposals with valid-until in reminder window (recurring only)`
    );
    for (const proposal of expiryDue) {
      const ok = await sendValidUntilReminder(proposal);
      if (ok) {
        stats.expirySent++;
      } else {
        stats.expiryErrors++;
      }
    }

    logger.info(
      `Renewal reminder job completed: renewals ${stats.sent} sent (${stats.errors} errors); valid-until ${stats.expirySent} sent (${stats.expiryErrors} errors)`
    );
    return stats;
  } catch (error) {
    logger.error('Renewal reminder job failed:', error);
    throw error;
  }
}

/**
 * Manual trigger for testing
 */
export async function sendTestRenewalReminder(proposalId: string): Promise<boolean> {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: {
      client: { select: { name: true } },
      createdBy: { select: { email: true } },
      tenant: { select: { id: true, name: true } },
    },
  });

  if (!proposal || !proposal.renewalDate) {
    logger.error(`Proposal not found or no renewal date: ${proposalId}`);
    return false;
  }

  return sendRenewalReminder(proposal as any);
}

export default {
  runRenewalReminders,
  sendTestRenewalReminder,
  calculateRenewalDate,
  proposalHasRecurringEngagement,
};
