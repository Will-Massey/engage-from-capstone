/**
 * Clara morning brief — rule-based “what should I do this morning?”
 * Aggregates board risk, mailbox unread, pending forms, unsigned proposals, cash risk.
 */

import { prisma } from '../config/database.js';
import { prioritiseJobsBoard } from './claraBoardService.js';
import { listMailboxMessages } from './mailboxService.js';
import { listAssignments } from './practiceFormsService.js';

export type BriefAction = {
  id: string;
  priority: number;
  kind: 'job' | 'mail' | 'form' | 'proposal' | 'money' | 'mention';
  title: string;
  detail: string;
  href: string;
  cta: string;
};

export type MorningBrief = {
  generatedAt: string;
  greeting: string;
  summary: string;
  actions: BriefAction[];
  stats: {
    overdueJobs: number;
    helpNeeded: number;
    unreadMail: number;
    pendingForms: number;
    unsignedProposals: number;
    openMentions: number;
  };
};

export async function buildMorningBrief(
  tenantId: string,
  userId?: string | null,
  firstName?: string | null
): Promise<MorningBrief> {
  const now = new Date();
  const hour = now.getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const greeting = `${hello}${firstName ? `, ${firstName}` : ''}`;

  const [board, mail, forms, unsignedCount, mentions, helpCount, overdueCount] = await Promise.all([
    prioritiseJobsBoard(tenantId, 5),
    listMailboxMessages(tenantId, { limit: 40, unread: true }).then((r) => r.messages),
    listAssignments(tenantId, { status: 'pending' }),
    prisma.proposal.count({
      where: { tenantId, status: { in: ['SENT', 'VIEWED'] } },
    }),
    userId
      ? prisma.activityLog.count({
          where: {
            tenantId,
            action: 'JOB_MENTION',
            userId,
            createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        })
      : Promise.resolve(0),
    prisma.job.count({
      where: {
        tenantId,
        isActive: true,
        boardColumn: 'HELP_NEEDED',
      },
    }),
    prisma.job.count({
      where: {
        tenantId,
        isActive: true,
        boardColumn: { not: 'COMPLETE' },
        dueAt: { lt: now },
      },
    }),
  ]);

  const actions: BriefAction[] = [];

  for (const item of board.items.slice(0, 4)) {
    actions.push({
      id: `job-${item.jobId}`,
      priority: item.score,
      kind: 'job',
      title: item.clientName,
      detail: `${item.title} · ${item.reasons.slice(0, 2).join(', ')} · ${item.suggestedAction}`,
      href: `/jobs/${item.jobId}`,
      cta: item.suggestedPackId ? 'Open & chase' : 'Open job',
    });
  }

  for (const m of mail.slice(0, 3)) {
    actions.push({
      id: `mail-${m.id}`,
      priority: 55 + (m.read ? 0 : 10),
      kind: 'mail',
      title: m.subject || 'Unread mail',
      detail: `${m.from}${m.clientName ? ` · ${m.clientName}` : ''}`,
      href: `/inbox`,
      cta: 'Reply in mailbox',
    });
  }

  // Forms overdue or pending (dueAt in metadata if present)
  const formSlice = forms.slice(0, 4);
  for (const f of formSlice) {
    const dueBoost =
      f.assignedAt && Date.now() - new Date(f.assignedAt).getTime() > 3 * 24 * 60 * 60 * 1000
        ? 15
        : 0;
    actions.push({
      id: `form-${f.id}`,
      priority: 40 + dueBoost,
      kind: 'form',
      title: f.templateName,
      detail: `Awaiting ${f.clientName || 'client'} · assigned ${new Date(f.assignedAt).toLocaleDateString('en-GB')}`,
      href: `/forms`,
      cta: 'Track form',
    });
  }

  if (unsignedCount > 0) {
    actions.push({
      id: 'prop-unsigned',
      priority: 48,
      kind: 'proposal',
      title: `${unsignedCount} unsigned proposal${unsignedCount === 1 ? '' : 's'}`,
      detail: 'Sent or viewed — chase or open pipeline',
      href: '/proposals?status=SENT',
      cta: 'Open proposals',
    });
  }

  if (mentions > 0 && userId) {
    actions.push({
      id: 'mentions',
      priority: 50,
      kind: 'mention',
      title: `${mentions} @mention${mentions === 1 ? '' : 's'} this week`,
      detail: 'Colleagues tagged you on job notes',
      href: '/jobs',
      cta: 'Review jobs',
    });
  }

  // Money nudge if dunning-ish activity exists
  const dunning = await prisma.activityLog.count({
    where: {
      tenantId,
      action: { in: ['RECURRING_PAYMENT_FAILED', 'DUNNING_RETRY'] },
      createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    },
  });
  if (dunning > 0) {
    actions.push({
      id: 'money-dunning',
      priority: 60,
      kind: 'money',
      title: 'Payment recovery needs attention',
      detail: `${dunning} dunning event(s) in the last 14 days`,
      href: '/analytics',
      cta: 'Open analytics',
    });
  }

  actions.sort((a, b) => b.priority - a.priority);
  const top = actions.slice(0, 8);

  const stats = {
    overdueJobs: overdueCount,
    helpNeeded: helpCount,
    unreadMail: mail.length,
    pendingForms: forms.length,
    unsignedProposals: unsignedCount,
    openMentions: mentions,
  };

  const parts: string[] = [];
  if (stats.overdueJobs)
    parts.push(`${stats.overdueJobs} overdue job${stats.overdueJobs === 1 ? '' : 's'}`);
  if (stats.helpNeeded) parts.push(`${stats.helpNeeded} need help`);
  if (stats.unreadMail) parts.push(`${stats.unreadMail} unread mail`);
  if (stats.pendingForms)
    parts.push(`${stats.pendingForms} form${stats.pendingForms === 1 ? '' : 's'} waiting`);
  if (stats.unsignedProposals) parts.push(`${stats.unsignedProposals} unsigned`);
  if (!parts.length) parts.push('inbox is calm — good time to win work');

  return {
    generatedAt: now.toISOString(),
    greeting,
    summary: board.summary ? `${parts.join(' · ')}. ${board.summary}` : parts.join(' · '),
    actions: top,
    stats,
  };
}
