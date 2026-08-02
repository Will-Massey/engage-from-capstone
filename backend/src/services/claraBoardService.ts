/**
 * Clara board prioritisation — rank open jobs by risk and suggest next actions.
 * Rule-based (no LLM required); optional Clara draft can be chained from the UI.
 */

import { prisma } from '../config/database.js';

export type BoardPriorityItem = {
  jobId: string;
  reference: string;
  title: string;
  clientName: string;
  clientId: string;
  boardColumn: string;
  dueAt: string | null;
  feePence: number;
  assigneeName: string | null;
  score: number;
  reasons: string[];
  suggestedAction: string;
  suggestedPackId: string | null;
};

function daysOverdue(dueAt: Date | null, now: Date): number {
  if (!dueAt || dueAt >= now) return 0;
  return Math.ceil((now.getTime() - dueAt.getTime()) / (1000 * 60 * 60 * 24));
}

export async function prioritiseJobsBoard(
  tenantId: string,
  limit = 8
): Promise<{ items: BoardPriorityItem[]; generatedAt: string; summary: string }> {
  const now = new Date();
  const jobs = await prisma.job.findMany({
    where: { tenantId, isActive: true, boardColumn: { not: 'COMPLETE' } },
    select: {
      id: true,
      reference: true,
      title: true,
      boardColumn: true,
      dueAt: true,
      proposedFeePence: true,
      assigneeId: true,
      client: { select: { id: true, name: true } },
      assignee: { select: { firstName: true, lastName: true } },
      phases: { select: { isComplete: true, progressPct: true } },
    },
    take: 200,
  });

  const scored: BoardPriorityItem[] = [];

  for (const j of jobs) {
    let score = 0;
    const reasons: string[] = [];
    const overdue = daysOverdue(j.dueAt, now);

    if (overdue > 0) {
      score += 40 + Math.min(40, overdue * 3);
      reasons.push(`${overdue}d overdue`);
    } else if (j.dueAt) {
      const daysLeft = Math.ceil((j.dueAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 7) {
        score += 25 - daysLeft;
        reasons.push(`due in ${daysLeft}d`);
      }
    }

    if (j.boardColumn === 'HELP_NEEDED') {
      score += 45;
      reasons.push('needs help');
    } else if (j.boardColumn === 'REQUEST_RECORDS') {
      score += 22;
      reasons.push('awaiting records');
    } else if (j.boardColumn === 'IN_REVIEW') {
      score += 12;
      reasons.push('in review');
    }

    if (!j.assigneeId) {
      score += 18;
      reasons.push('unassigned');
    }

    const phasePct =
      j.phases.length === 0
        ? 0
        : Math.round(j.phases.reduce((a, p) => a + (p.progressPct || 0), 0) / j.phases.length);
    if (phasePct < 25 && j.boardColumn === 'IN_PROGRESS') {
      score += 10;
      reasons.push('low progress');
    }

    // Fee weight (high value first among peers)
    score += Math.min(15, Math.round(j.proposedFeePence / 50_000));

    if (score < 12 && reasons.length === 0) continue;

    let suggestedPackId: string | null = null;
    let suggestedAction = 'Review on board';
    if (overdue > 0 || j.boardColumn === 'REQUEST_RECORDS') {
      suggestedPackId = 'RECORDS_REQUEST';
      suggestedAction = 'Draft records chase';
    } else if (j.boardColumn === 'HELP_NEEDED') {
      suggestedPackId = null;
      suggestedAction = 'Assign senior / Clara draft update';
    } else if (j.dueAt && daysOverdue(j.dueAt, now) === 0) {
      const daysLeft = Math.ceil((j.dueAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 7) {
        suggestedPackId = 'DEADLINE_APPROACHING';
        suggestedAction = 'Draft deadline approaching email';
      }
    }

    scored.push({
      jobId: j.id,
      reference: j.reference,
      title: j.title,
      clientName: j.client.name,
      clientId: j.client.id,
      boardColumn: j.boardColumn,
      dueAt: j.dueAt?.toISOString() || null,
      feePence: j.proposedFeePence,
      assigneeName: j.assignee
        ? `${j.assignee.firstName} ${j.assignee.lastName}`
        : null,
      score,
      reasons: reasons.length ? reasons : ['on radar'],
      suggestedAction,
      suggestedPackId,
    });
  }

  scored.sort((a, b) => b.score - a.score || b.feePence - a.feePence);
  const items = scored.slice(0, limit);
  const overdueN = items.filter((i) => i.reasons.some((r) => r.includes('overdue'))).length;
  const helpN = items.filter((i) => i.boardColumn === 'HELP_NEEDED').length;
  const summary =
    items.length === 0
      ? 'Board looks calm — no high-risk open jobs.'
      : `${items.length} jobs need attention` +
        (overdueN ? ` · ${overdueN} overdue` : '') +
        (helpN ? ` · ${helpN} need help` : '');

  return { items, generatedAt: now.toISOString(), summary };
}
