import { prisma } from '../config/database.js';
import { tenantMailer } from '../services/tenantMailer.js';
import logger from '../config/logger.js';
import {
  tryGenerateFollowUpEmail,
  type LifecycleEmailTone,
} from '../services/ai/lifecycleAiEmailService.js';
import { getFrontendUrl } from '../config/urls.js';

/**
 * Email Automation Job
 *
 * Sends automated follow-up emails for proposals based on their status and age.
 * Should be run daily via a cron job.
 */

type ReminderKind = 'unopened' | 'unsigned' | 'expiring';

interface FollowUpConfig {
  kind: ReminderKind;
  daysThreshold: number;
  subject: string;
  template: 'gentle' | 'urgent' | 'final';
  actionTag: string;
}

/** Verified reminder schedule: unopened 3d, unsigned 7d, expiring 30d before validUntil */
const REMINDER_SEQUENCE: FollowUpConfig[] = [
  {
    kind: 'unopened',
    daysThreshold: 3,
    subject: 'Following up on your proposal',
    template: 'gentle',
    actionTag: 'unopened-3d',
  },
  {
    kind: 'unsigned',
    daysThreshold: 7,
    subject: 'Have you had a chance to review your proposal?',
    template: 'gentle',
    actionTag: 'unsigned-7d',
  },
  {
    kind: 'expiring',
    daysThreshold: 30,
    subject: 'Your proposal expires soon',
    template: 'final',
    actionTag: 'expiring-30d',
  },
];

/**
 * Check if a proposal needs a follow-up email
 */
async function shouldSendFollowUp(proposalId: string, actionTag: string): Promise<boolean> {
  const existingLog = await prisma.activityLog.findFirst({
    where: {
      entityType: 'PROPOSAL',
      entityId: proposalId,
      action: 'FOLLOW_UP_SENT',
      OR: [{ description: { contains: actionTag } }, { metadata: { contains: actionTag } }],
    },
  });

  return !existingLog;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function resolveReminderConfig(
  proposal: { status: string; sentAt: Date | null; viewedAt: Date | null; validUntil: Date },
  now: Date
): FollowUpConfig | null {
  if (!proposal.sentAt) return null;

  const daysSinceSent = daysBetween(proposal.sentAt, now);

  // Unopened: SENT status, never viewed, 3+ days
  if (proposal.status === 'SENT' && !proposal.viewedAt && daysSinceSent >= 3) {
    return REMINDER_SEQUENCE.find((c) => c.kind === 'unopened') || null;
  }

  // Unsigned: VIEWED but not accepted, 7+ days since first view (or send)
  if (proposal.status === 'VIEWED') {
    const anchor = proposal.viewedAt || proposal.sentAt;
    const daysSinceView = daysBetween(anchor, now);
    if (daysSinceView >= 7) {
      return REMINDER_SEQUENCE.find((c) => c.kind === 'unsigned') || null;
    }
  }

  // Expiring: validUntil within 30 days
  const daysUntilExpiry = daysBetween(now, proposal.validUntil);
  if (
    ['SENT', 'VIEWED'].includes(proposal.status) &&
    daysUntilExpiry >= 0 &&
    daysUntilExpiry <= 30
  ) {
    return REMINDER_SEQUENCE.find((c) => c.kind === 'expiring') || null;
  }

  return null;
}

/**
 * Get email template based on follow-up type
 */
function getEmailTemplate(
  template: string,
  proposal: any
): {
  subject: string;
  body: string;
} {
  const clientName = proposal.client.name;
  const proposalTitle = proposal.title;
  const proposalRef = proposal.reference;
  const senderName = Array.from(
    new Set([proposal.createdBy.firstName, proposal.createdBy.lastName].filter(Boolean))
  ).join(' ');
  const senderPosition = proposal.createdBy.role;
  const practiceName = proposal.tenant.name;

  const frontendUrl = getFrontendUrl();
  const viewLink = `${frontendUrl}/proposals/view/${proposal.shareToken || proposal.id}`;

  const totalAmount = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(proposal.total);

  switch (template) {
    case 'gentle':
      return {
        subject: `Following up on your proposal from ${practiceName}`,
        body: `
Dear ${clientName},

I hope this email finds you well.

I wanted to follow up on the proposal I sent you recently regarding "${proposalTitle}" (Reference: ${proposalRef}).

The proposal outlines services worth ${totalAmount} and is designed to help you achieve your business goals while ensuring full compliance.

If you have any questions or would like to discuss any aspects of the proposal, please don't hesitate to reach out. I'm here to help!

You can view the full proposal here: ${viewLink}

Best regards,
${senderName}
${senderPosition}
${practiceName}
        `.trim(),
      };

    case 'urgent':
      return {
        subject: `Reminder: Your proposal from ${practiceName}`,
        body: `
Dear ${clientName},

I hope you're doing well.

I wanted to reach out again regarding the proposal I sent for "${proposalTitle}" (Reference: ${proposalRef}).

I understand you're busy, and I don't want this to slip through the cracks. The proposal (${totalAmount}) is tailored specifically for your needs and includes:

${proposal.services.map((s: any) => `- ${s.name}`).join('\n')}

If you'd like to proceed or have any questions, please let me know. I'm happy to schedule a quick call to walk through anything.

View the proposal: ${viewLink}

Best regards,
${senderName}
${senderPosition}
${practiceName}
        `.trim(),
      };

    case 'final':
      return {
        subject: `Final reminder: Your proposal expires soon`,
        body: `
Dear ${clientName},

I hope this message finds you well.

This is a final reminder regarding the proposal "${proposalTitle}" (Reference: ${proposalRef}) that I sent you a while ago.

The proposal (${totalAmount}) will be expiring soon, and I wanted to make sure you had the opportunity to review it.

If you're no longer interested, no problem at all - just let me know so I can close this off. If you'd like to proceed or need any changes, I'm here to help.

View the proposal: ${viewLink}

Best regards,
${senderName}
${senderPosition}
${practiceName}

P.S. If you've decided to go in a different direction, I'd appreciate any feedback on how we could have better served your needs.
        `.trim(),
      };

    default:
      return {
        subject: `Following up on your proposal`,
        body: `Please review your proposal at ${viewLink}`,
      };
  }
}

function toneForTemplate(template: FollowUpConfig['template']): LifecycleEmailTone {
  switch (template) {
    case 'gentle':
      return 'friendly';
    case 'urgent':
      return 'urgent';
    case 'final':
      return 'urgent';
    default:
      return 'professional';
  }
}

/**
 * Send follow-up email for a single proposal
 */
async function sendFollowUp(proposal: any, config: FollowUpConfig): Promise<boolean> {
  try {
    let subject: string;
    let body: string;

    const aiDraft = await tryGenerateFollowUpEmail(
      proposal.tenantId,
      proposal.id,
      toneForTemplate(config.template),
      proposal.tenant?.settings
    );

    if (aiDraft) {
      subject = aiDraft.subject;
      body = aiDraft.body;
      logger.info(`Using Clara follow-up for proposal ${proposal.id} (${config.template})`);
    } else {
      const template = getEmailTemplate(config.template, proposal);
      subject = template.subject;
      body = template.body;
    }

    const result = await tenantMailer.send({
      tenantId: proposal.tenantId,
      messageType: 'FOLLOW_UP',
      message: {
        to: proposal.client.contactEmail,
        subject,
        text: body,
        html: body.replace(/\n/g, '<br>'),
        replyTo: proposal.createdBy?.email,
      },
      relatedIds: { proposalId: proposal.id, clientId: proposal.clientId },
    });

    if (result.success) {
      // Log the follow-up
      await prisma.activityLog.create({
        data: {
          tenantId: proposal.tenantId,
          userId: proposal.createdById,
          action: 'FOLLOW_UP_SENT',
          entityType: 'PROPOSAL',
          entityId: proposal.id,
          proposalId: proposal.id,
          description: `Sent ${config.kind} reminder (${config.actionTag})`,
          metadata: JSON.stringify({
            kind: config.kind,
            actionTag: config.actionTag,
            template: config.template,
          }),
        },
      });

      logger.info(`Follow-up email sent for proposal ${proposal.id} (${config.actionTag})`);
      return true;
    } else {
      logger.error(`Failed to send follow-up for proposal ${proposal.id}: ${result.error}`);
      return false;
    }
  } catch (error) {
    logger.error(`Error sending follow-up for proposal ${proposal.id}:`, error);
    return false;
  }
}

/**
 * Main email automation job
 * Run this daily to send follow-up emails
 */
export async function runEmailAutomation(): Promise<{
  success: boolean;
  sent: number;
  failed: number;
  skipped: number;
}> {
  logger.info('Starting email automation job...');

  const stats = {
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  try {
    const now = new Date();
    const maxAge = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000);

    const proposals = await prisma.proposal.findMany({
      where: {
        status: { in: ['SENT', 'VIEWED'] },
        sentAt: {
          gte: maxAge,
          lte: now,
        },
        publicAccessEnabled: true,
      },
      include: {
        client: true,
        tenant: { select: { id: true, name: true, settings: true } },
        services: true,
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
            role: true,
            email: true,
          },
        },
      },
    });

    logger.info(`Found ${proposals.length} proposals for potential follow-up`);

    for (const proposal of proposals) {
      const followUpConfig = resolveReminderConfig(
        {
          status: proposal.status,
          sentAt: proposal.sentAt,
          viewedAt: proposal.viewedAt,
          validUntil: proposal.validUntil,
        },
        now
      );

      if (!followUpConfig) {
        stats.skipped++;
        continue;
      }

      const shouldSend = await shouldSendFollowUp(proposal.id, followUpConfig.actionTag);

      if (!shouldSend) {
        stats.skipped++;
        continue;
      }

      const sent = await sendFollowUp(proposal, followUpConfig);

      if (sent) {
        stats.sent++;
      } else {
        stats.failed++;
      }

      // Add small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    logger.info(
      `Email automation completed: ${stats.sent} sent, ${stats.failed} failed, ${stats.skipped} skipped`
    );

    return { success: true, ...stats };
  } catch (error) {
    logger.error('Email automation job failed:', error);
    return { success: false, ...stats };
  }
}

/**
 * Manual trigger for testing
 */
export async function testEmailAutomation(proposalId: string, tenantId: string): Promise<boolean> {
  try {
    const proposal = await prisma.proposal.findFirst({
      where: { id: proposalId, tenantId },
      include: {
        client: true,
        tenant: { select: { id: true, name: true, settings: true } },
        services: true,
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });

    if (!proposal) {
      logger.error(`Proposal ${proposalId} not found`);
      return false;
    }

    const config: FollowUpConfig = {
      kind: 'unopened',
      daysThreshold: 3,
      subject: 'Test follow-up',
      template: 'gentle',
      actionTag: 'unopened-3d-test',
    };

    return await sendFollowUp(proposal, config);
  } catch (error) {
    logger.error('Test email automation failed:', error);
    return false;
  }
}

export default runEmailAutomation;
