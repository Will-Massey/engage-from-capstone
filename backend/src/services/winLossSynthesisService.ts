/**
 * Monthly win/loss synthesis per tenant — practice insights from proposal outcomes.
 */
import { prisma } from '../config/database.js';

export interface WinLossSynthesis {
  period: { from: string; to: string };
  summary: {
    won: number;
    lost: number;
    stalled: number;
    winRate: number;
    avgWonValue: number;
    avgLostValue: number;
  };
  insights: string[];
  topWonServices: Array<{ name: string; count: number }>;
  stallReasons: Array<{ reason: string; count: number }>;
}

export async function synthesiseWinLoss(
  tenantId: string,
  monthsBack = 1,
): Promise<WinLossSynthesis> {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const proposals = await prisma.proposal.findMany({
    where: {
      tenantId,
      createdAt: { gte: from, lte: to },
      status: { in: ['ACCEPTED', 'DECLINED', 'SENT', 'VIEWED', 'EXPIRED'] },
    },
    include: {
      services: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const won = proposals.filter((p) => p.status === 'ACCEPTED');
  const lost = proposals.filter((p) => p.status === 'DECLINED');
  const stalled = proposals.filter((p) =>
    ['SENT', 'VIEWED', 'EXPIRED'].includes(p.status),
  );

  const decided = won.length + lost.length;
  const winRate = decided > 0 ? Math.round((won.length / decided) * 100) : 0;

  const avg = (items: typeof proposals) =>
    items.length
      ? items.reduce((s, p) => s + (p.total || 0), 0) / items.length
      : 0;

  const serviceCounts = new Map<string, number>();
  for (const p of won) {
    for (const s of p.services) {
      serviceCounts.set(s.name, (serviceCounts.get(s.name) || 0) + 1);
    }
  }

  const topWonServices = [...serviceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const declineLogs = await prisma.activityLog.findMany({
    where: {
      tenantId,
      action: 'PROPOSAL_DECLINED',
      createdAt: { gte: from, lte: to },
    },
    select: { metadata: true },
    take: 100,
  });

  const declineReasons = new Map<string, number>();
  for (const log of declineLogs) {
    let reason = 'No reason given';
    try {
      const meta = JSON.parse(log.metadata || '{}');
      if (meta.reason) reason = String(meta.reason).trim();
    } catch {
      // keep default
    }
    declineReasons.set(reason, (declineReasons.get(reason) || 0) + 1);
  }

  const stallReasons = [...declineReasons.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  const insights: string[] = [];
  if (winRate >= 60) {
    insights.push(`Strong month — ${winRate}% win rate across decided proposals.`);
  } else if (winRate > 0 && winRate < 40) {
    insights.push(`Win rate at ${winRate}% — review pricing and follow-up timing on stalled deals.`);
  }
  if (stalled.length > won.length) {
    insights.push(`${stalled.length} proposals still open — consider Clara reminder automation.`);
  }
  if (topWonServices[0]) {
    insights.push(`Top winning service: ${topWonServices[0].name} (${topWonServices[0].count} accepted).`);
  }
  if (!insights.length) {
    insights.push('Not enough proposal activity this period for detailed insights yet.');
  }

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    summary: {
      won: won.length,
      lost: lost.length,
      stalled: stalled.length,
      winRate,
      avgWonValue: Math.round(avg(won) * 100) / 100,
      avgLostValue: Math.round(avg(lost) * 100) / 100,
    },
    insights,
    topWonServices,
    stallReasons,
  };
}