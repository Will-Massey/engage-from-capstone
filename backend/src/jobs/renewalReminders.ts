/**
 * Renewal Reminder Background Job
 * Sends email notifications 30 days before proposal renewal dates
 */

import { prisma } from '../config/database.js';
import { createEmailService } from '../services/emailService.js';
import logger from '../config/logger.js';

const REMINDER_DAYS = 30;

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
  }>
> {
  const now = new Date();
  const reminderDate = new Date();
  reminderDate.setDate(now.getDate() + REMINDER_DAYS);

  // Find start and end of the reminder day (to catch all proposals due that day)
  const startOfDay = new Date(reminderDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(reminderDate);
  endOfDay.setHours(23, 59, 59, 999);

  const proposals = await prisma.proposal.findMany({
    where: {
      status: 'ACCEPTED',
      renewalDate: {
        gte: startOfDay,
        lte: endOfDay,
      },
      renewalReminderSent: false,
    },
    include: {
      client: {
        select: { name: true },
      },
      createdBy: {
        select: { email: true },
      },
      tenant: {
        select: { id: true, name: true },
      },
    },
  });

  return proposals as any;
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

    const emailService = createEmailService();
    if (!emailService) {
      logger.error('Email service not configured');
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
      daysUntilRenewal: REMINDER_DAYS,
      tenantName: proposal.tenant.name,
    });

    const result = await emailService.sendEmail({
      to: proposal.createdBy.email,
      subject,
      html,
      text,
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
}> {
  logger.info('Running renewal reminder job...');

  const stats = { checked: 0, sent: 0, errors: 0 };

  try {
    // Update any proposals missing renewal dates
    await updateMissingRenewalDates();

    // Find renewals due
    const renewalsDue = await findRenewalsDue();
    stats.checked = renewalsDue.length;

    logger.info(`Found ${renewalsDue.length} proposals with renewals due in ${REMINDER_DAYS} days`);

    // Send reminders
    for (const proposal of renewalsDue) {
      const success = await sendRenewalReminder(proposal);
      if (success) {
        stats.sent++;
      } else {
        stats.errors++;
      }
    }

    logger.info(`Renewal reminder job completed: ${stats.sent} sent, ${stats.errors} errors`);
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
};
