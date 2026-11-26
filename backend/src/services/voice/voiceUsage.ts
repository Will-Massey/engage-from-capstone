import { prisma } from '../../config/database.js';
import {
  capAllows,
  chargeableSeconds,
  estimateCostUsd,
  foldRealtimeUsage,
  usdPerMinute,
  type FoldedRealtimeUsage,
} from './xaiConfig.js';

const STALE_MS = 3 * 60 * 1000;

export function londonDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export async function closeStaleVoiceSessions(userId: string, now = new Date()): Promise<void> {
  const open = await prisma.xaiUsage.findMany({
    where: { userId, endedAt: null },
  });
  for (const row of open) {
    const mark = row.lastHeartbeatAt ?? row.startedAt;
    if (now.getTime() - mark.getTime() <= STALE_MS) continue;
    const seconds = Math.max(0, Math.round((mark.getTime() - row.startedAt.getTime()) / 1000));
    const rate = row.rateUsdPerMinute ?? usdPerMinute();
    const billed = row.billableAudioSeconds;
    const costSeconds = billed != null ? Math.max(seconds, billed) : seconds;
    await prisma.xaiUsage.update({
      where: { id: row.id },
      data: {
        endedAt: mark,
        seconds,
        estimatedCostUsd: estimateCostUsd(costSeconds, rate),
        rateUsdPerMinute: rate,
      },
    });
  }
}

export async function secondsUsedToday(userId: string, now = new Date()): Promise<number> {
  const today = londonDateKey(now);
  const since = new Date(now.getTime() - 36 * 60 * 60 * 1000);
  const rows = await prisma.xaiUsage.findMany({
    where: { userId, startedAt: { gte: since } },
  });
  let total = 0;
  for (const row of rows) {
    if (londonDateKey(row.startedAt) !== today) continue;
    total += chargeableSeconds({
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      now,
      billableAudioSeconds: row.billableAudioSeconds,
      storedSeconds: row.seconds,
    });
  }
  return total;
}

export async function assertDailyCap(userId: string, now = new Date()): Promise<void> {
  const used = await secondsUsedToday(userId, now);
  const decision = capAllows(used);
  if (!decision.allowed) {
    const { ApiError } = await import('../../middleware/errorHandler.js');
    const { dailyCapMinutes } = await import('./xaiConfig.js');
    throw new ApiError(
      'VOICE_CAP',
      `The daily voice limit of ${dailyCapMinutes()} minutes is used up. It resets tomorrow.`,
      429
    );
  }
}

export async function recordVoiceUsage(
  usageId: string,
  userId: string,
  events: unknown[],
  now = new Date()
): Promise<FoldedRealtimeUsage & { seconds: number; estimatedCostUsd: number }> {
  const row = await prisma.xaiUsage.findFirst({ where: { id: usageId, userId } });
  if (!row) {
    const { ApiError } = await import('../../middleware/errorHandler.js');
    throw new ApiError('NOT_FOUND', 'Voice session not found.', 404);
  }
  const folded = foldRealtimeUsage(events);
  const billable =
    folded.billableAudioSeconds != null
      ? Math.max(row.billableAudioSeconds ?? 0, folded.billableAudioSeconds)
      : row.billableAudioSeconds;
  const end = row.endedAt ?? now;
  const seconds = Math.max(0, Math.round((end.getTime() - row.startedAt.getTime()) / 1000));
  const rate = row.rateUsdPerMinute ?? usdPerMinute();
  const costSeconds = billable != null ? Math.max(seconds, billable) : seconds;
  await prisma.xaiUsage.update({
    where: { id: row.id },
    data: {
      endedAt: row.endedAt ?? now,
      lastHeartbeatAt: now,
      seconds,
      billableAudioSeconds: billable,
      inputTokens: folded.inputTokens ?? row.inputTokens,
      outputTokens: folded.outputTokens ?? row.outputTokens,
      totalTokens: folded.totalTokens ?? row.totalTokens,
      rateUsdPerMinute: rate,
      estimatedCostUsd: estimateCostUsd(costSeconds, rate),
    },
  });
  return {
    ...folded,
    billableAudioSeconds: billable,
    seconds,
    estimatedCostUsd: estimateCostUsd(costSeconds, rate),
  };
}

export type UsageRow = {
  userId: string;
  userName: string;
  startedAt: Date;
  seconds: number;
  estimatedCostUsd: number;
};

export function groupUsage(rows: UsageRow[]): {
  byDay: Array<{
    day: string;
    userId: string;
    userName: string;
    seconds: number;
    minutes: number;
    estimatedCostUsd: number;
  }>;
  byMonth: Array<{
    month: string;
    userId: string;
    userName: string;
    seconds: number;
    minutes: number;
    estimatedCostUsd: number;
  }>;
  totals: { seconds: number; minutes: number; estimatedCostUsd: number };
} {
  const dayMap = new Map<string, UsageRow & { seconds: number; estimatedCostUsd: number }>();
  const monthMap = new Map<string, UsageRow & { seconds: number; estimatedCostUsd: number }>();
  let seconds = 0;
  let estimatedCostUsd = 0;
  for (const row of rows) {
    seconds += row.seconds;
    estimatedCostUsd += row.estimatedCostUsd;
    const day = londonDateKey(row.startedAt);
    const month = day.slice(0, 7);
    const dayKey = `${day}:${row.userId}`;
    const monthKey = `${month}:${row.userId}`;
    const add = (
      map: Map<string, UsageRow & { seconds: number; estimatedCostUsd: number }>,
      key: string
    ) => {
      const current = map.get(key);
      if (!current) {
        map.set(key, { ...row, seconds: row.seconds, estimatedCostUsd: row.estimatedCostUsd });
      } else {
        current.seconds += row.seconds;
        current.estimatedCostUsd += row.estimatedCostUsd;
      }
    };
    add(dayMap, dayKey);
    add(monthMap, monthKey);
  }
  const pack = (
    map: Map<string, UsageRow & { seconds: number; estimatedCostUsd: number }>,
    field: 'day' | 'month'
  ) =>
    [...map.entries()]
      .map(([key, value]) => ({
        [field]: key.split(':')[0],
        userId: value.userId,
        userName: value.userName,
        seconds: Math.round(value.seconds),
        minutes: Math.round((value.seconds / 60) * 10) / 10,
        estimatedCostUsd: Math.round(value.estimatedCostUsd * 100) / 100,
      }))
      .sort((a, b) => String(b[field]).localeCompare(String(a[field])));
  return {
    byDay: pack(dayMap, 'day') as Array<{
      day: string;
      userId: string;
      userName: string;
      seconds: number;
      minutes: number;
      estimatedCostUsd: number;
    }>,
    byMonth: pack(monthMap, 'month') as Array<{
      month: string;
      userId: string;
      userName: string;
      seconds: number;
      minutes: number;
      estimatedCostUsd: number;
    }>,
    totals: {
      seconds: Math.round(seconds),
      minutes: Math.round((seconds / 60) * 10) / 10,
      estimatedCostUsd: Math.round(estimatedCostUsd * 100) / 100,
    },
  };
}
