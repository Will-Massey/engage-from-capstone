/**
 * Proposal chase job — automated reminder emails for unsigned proposals.
 * Uses per-tenant chaseSequenceDays from Settings → Communications.
 */

import { prisma } from '../config/database.js';
import { tenantMailer } from '../services/tenantMailer.js';
import logger from '../config/logger.js';
import {
  tryGenerateFollowUpEmail,
  type LifecycleEmailTone,
} from '../services/ai/lifecycleAiEmailService.js';
import { getProposalSettings } from '../utils/tenantProposalSettings.js';

export const PROPOSAL_CHASE_SENT_ACTION = 'PROPOSAL_CHASE_SENT';

type ChaseProposal = Awaited<ReturnType<typeof loadChaseCandidates>>[number];

function startOfUtcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function toneForChaseDay(chaseDay: number, sequence: number[]): LifecycleEmailTone {
  const maxDay = sequence[sequence.length - 1] ?? chaseDay;
  const midDay = sequence[Math.floor(sequence.length / 2)] ?? chaseDay;
  if (chaseDay >= maxDay) return 'urgent';
  if (chaseDay >= midDay) return 'friendly';
  return 'professional';
}

function getFallbackChaseEmail(
  proposal: ChaseProposal,
  chaseDay: number
): { subject: string; body: string } {
  const clientName = proposal.client.contactName?.trim() || proposal.client.name;
  const senderName = proposal.createdBy
    ? Array.from(
        new Set([proposal.createdBy.firstName, proposal.createdBy.lastName].filter(Boolean))
      ).join(' ')
    : proposal.tenant.name;
  const frontendUrl = (process.env.FRONTEND_URL || 'https://engagebycapstone.co.uk').replace(
    /\/$/,
    ''
  );
  const viewLink = `${frontendUrl}/proposals/view/${proposal.shareToken || proposal.id}`;
  const totalAmount = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(proposal.total);

  return {
    subject: `Reminder: ${proposal.title} from ${proposal.tenant.name}`,
    body: `Dear ${clientName},

I hope you are well. I wanted to follow up on the proposal "${proposal.title}" (reference ${proposal.reference}) that we sent ${chaseDay} day${chaseDay === 1 ? '' : 's'} ago.

The proposal outlines services worth ${totalAmount}. If you have any questions or would like to discuss anything before signing, please let us know — we are happy to help.

You can review and accept the proposal here:
${viewLink}

Kind regards,
${senderName}
${proposal.tenant.name}`.trim(),
  };
}

async function alreadySentChaseToday(proposalId: string): Promise<boolean> {
  const todayStart = startOfUtcDay(new Date());
  const existing = await prisma.activityLog.findFirst({
    where: {
      entityType: 'PROPOSAL',
      entityId: proposalId,
      action: PROPOSAL_CHASE_SENT_ACTION,
      createdAt: { gte: todayStart },
    },
    select: { id: true },
  });
  return Boolean(existing);
}

async function alreadySentChaseForDay(proposalId: string, chaseDay: number): Promise<boolean> {
  const existing = await prisma.activityLog.findFirst({
    where: {
      entityType: 'PROPOSAL',
      entityId: proposalId,
      action: PROPOSAL_CHASE_SENT_ACTION,
      description: { contains: `day ${chaseDay}` },
    },
    select: { id: true },
  });
  return Boolean(existing);
}

async function nextChaseDayDue(
  proposalId: string,
  daysSinceSent: number,
  sequence: number[]
): Promise<number | null> {
  const sorted = [...sequence].sort((a, b) => a - b);
  for (const day of sorted) {
    if (daysSinceSent >= day && !(await alreadySentChaseForDay(proposalId, day))) {
      return day;
    }
  }
  return null;
}

async function loadChaseCandidates() {
  const now = new Date();
  const maxAge = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);

  return prisma.proposal.findMany({
    where: {
      status: { in: ['SENT', 'VIEWED'] },
      sentAt: { not: null, gte: maxAge, lte: now },
      publicAccessEnabled: true,
      client: { contactEmail: { not: '' } },
    },
    select: {
      id: true,
      tenantId: true,
      clientId: true,
      createdById: true,
      reference: true,
      title: true,
      total: true,
      sentAt: true,
      shareToken: true,
      emailHistory: true,
      client: { select: { name: true, contactName: true, contactEmail: true } },
      tenant: { select: { id: true, name: true, settings: true } },
      services: { select: { name: true } },
      createdBy: {
        select: { firstName: true, lastName: true, role: true, email: true },
      },
    },
  });
}

async function sendChaseEmail(
  proposal: ChaseProposal,
  chaseDay: number,
  sequence: number[]
): Promise<boolean> {
  const to = proposal.client.contactEmail?.trim();
  if (!to) {
    logger.warn(`Proposal ${proposal.id} has no client email — skipping chase`);
    return false;
  }

  try {
    const tone = toneForChaseDay(chaseDay, sequence);
    const aiDraft = await tryGenerateFollowUpEmail(
      proposal.tenantId,
      proposal.id,
      tone,
      proposal.tenant.settings
    );

    let subject: string;
    let body: string;
    if (aiDraft) {
      subject = aiDraft.subject;
      body = aiDraft.body;
      logger.info(`Using Clara chase email for proposal ${proposal.id} (day ${chaseDay})`);
    } else {
      const fallback = getFallbackChaseEmail(proposal, chaseDay);
      subject = fallback.subject;
      body = fallback.body;
    }

    const result = await tenantMailer.send({
      tenantId: proposal.tenantId,
      messageType: 'FOLLOW_UP',
      message: {
        to,
        subject,
        text: body,
        html: body.replace(/\n/g, '<br>'),
        replyTo: proposal.createdBy?.email || undefined,
      },
      relatedIds: { proposalId: proposal.id, clientId: proposal.clientId },
    });

    if (!result.success) {
      logger.error(`Chase email failed for proposal ${proposal.id}: ${result.error}`);
      return false;
    }

    const emailHistory = JSON.parse(proposal.emailHistory || '[]') as Array<Record<string, unknown>>;
    emailHistory.push({
      type: 'CHASE',
      chaseDay,
      sentAt: new Date().toISOString(),
      to,
      subject,
      messageId: result.messageId,
    });

    await prisma.proposal.update({
      where: { id: proposal.id },
      data: {
        lastEmailedAt: new Date(),
        emailHistory: JSON.stringify(emailHistory),
      },
    });

    await prisma.activityLog.create({
      data: {
        tenantId: proposal.tenantId,
        userId: proposal.createdById,
        action: PROPOSAL_CHASE_SENT_ACTION,
        entityType: 'PROPOSAL',
        entityId: proposal.id,
        proposalId: proposal.id,
        description: `Sent chase reminder email (day ${chaseDay} after send)`,
        metadata: JSON.stringify({
          chaseDay,
          to,
          messageId: result.messageId,
          aiPersonalised: Boolean(aiDraft),
        }),
      },
    });

    logger.info(`Chase email sent for proposal ${proposal.id} (day ${chaseDay})`);
    return true;
  } catch (error) {
    logger.error(`Error sending chase for proposal ${proposal.id}:`, error);
    return false;
  }
}

/**
 * Daily job — sends chase reminders per tenant chase sequence settings.
 */
export async function runProposalChaseJob(): Promise<{
  success: boolean;
  sent: number;
  failed: number;
  skipped: number;
}> {
  logger.info('Starting proposal chase job...');

  const stats = { sent: 0, failed: 0, skipped: 0 };
  const now = new Date();

  try {
    const proposals = await loadChaseCandidates();
    logger.info(`Found ${proposals.length} unsigned proposals for chase evaluation`);

    for (const proposal of proposals) {
      const settings = getProposalSettings(proposal.tenant.settings);
      if (!settings.chaseSequenceEnabled) {
        stats.skipped++;
        continue;
      }

      const sequence = settings.chaseSequenceDays;
      if (!sequence.length || !proposal.sentAt) {
        stats.skipped++;
        continue;
      }

      const daysSinceSent = Math.floor(
        (now.getTime() - proposal.sentAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (await alreadySentChaseToday(proposal.id)) {
        stats.skipped++;
        continue;
      }

      const chaseDay = await nextChaseDayDue(proposal.id, daysSinceSent, sequence);
      if (!chaseDay) {
        stats.skipped++;
        continue;
      }

      const ok = await sendChaseEmail(proposal, chaseDay, sequence);
      if (ok) {
        stats.sent++;
      } else {
        stats.failed++;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    logger.info(
      `Proposal chase job completed: ${stats.sent} sent, ${stats.failed} failed, ${stats.skipped} skipped`
    );
    return { success: true, ...stats };
  } catch (error) {
    logger.error('Proposal chase job failed:', error);
    return { success: false, ...stats };
  }
}

export default runProposalChaseJob;