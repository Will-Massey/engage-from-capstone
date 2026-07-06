/**
 * Engagement clause library versioning — OverSuite-style snapshots and template drift detection.
 */
import { prisma } from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import {
  ENGAGEMENT_CLAUSE_LIBRARY,
  EngagementClause,
  selectClausesForServices,
} from '../data/engagementClauseLibrary.js';

const INITIAL_VERSION_LABEL = '2026.2';
const INITIAL_CHANGELOG =
  'ICAEW/ACCA-aligned engagement clause packages (33 clauses): compliance, tax, MTD ITSA, AML, payroll, advisory, and standard terms.';

/** Version labels: `2026.2` (point) or `2026.Q3` (quarterly). */
export const VERSION_LABEL_PATTERN = /^\d{4}\.(Q[1-4]|\d+)$/;

const QUARTER_REVIEW_MONTHS = [0, 3, 6, 9]; // Jan, Apr, Jul, Oct

function clauseFingerprint(clause: EngagementClause): string {
  return JSON.stringify({
    id: clause.id,
    title: clause.title,
    tags: [...clause.tags].sort(),
    body: clause.body,
  });
}

export function diffClauseLibraries(
  oldClauses: EngagementClause[],
  newClauses: EngagementClause[]
): Set<string> {
  const changed = new Set<string>();
  const oldById = new Map(oldClauses.map((c) => [c.id, c]));
  const newById = new Map(newClauses.map((c) => [c.id, c]));

  for (const [id, clause] of newById) {
    const prev = oldById.get(id);
    if (!prev || clauseFingerprint(prev) !== clauseFingerprint(clause)) {
      changed.add(id);
    }
  }

  for (const id of oldById.keys()) {
    if (!newById.has(id)) changed.add(id);
  }

  return changed;
}

function parseClausesJson(raw: string): EngagementClause[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseServiceConfig(raw: string): Array<{ serviceId?: string; name?: string }> {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getLiveClauseLibrary(): EngagementClause[] {
  return ENGAGEMENT_CLAUSE_LIBRARY;
}

export async function ensureInitialLibraryVersion(): Promise<void> {
  const existing = await prisma.engagementLibraryVersion.findFirst();
  if (existing) return;

  const clauses = getLiveClauseLibrary();
  const created = await prisma.engagementLibraryVersion.create({
    data: {
      versionLabel: INITIAL_VERSION_LABEL,
      changelog: INITIAL_CHANGELOG,
      clausesJson: JSON.stringify(clauses),
      isCurrent: true,
      publishedAt: new Date(),
    },
  });

  await prisma.proposalTemplate.updateMany({
    where: { engagementLibraryVersionId: null },
    data: { engagementLibraryVersionId: created.id, needsUpdate: false },
  });
  await prisma.coverLetterTemplate.updateMany({
    where: { engagementLibraryVersionId: null },
    data: { engagementLibraryVersionId: created.id, needsUpdate: false },
  });
}

export async function getCurrentLibraryVersion() {
  await ensureInitialLibraryVersion();
  const current = await prisma.engagementLibraryVersion.findFirst({
    where: { isCurrent: true },
    orderBy: { publishedAt: 'desc' },
  });
  if (!current) {
    throw new ApiError('NOT_FOUND', 'No current engagement library version', 404);
  }
  return current;
}

export async function listLibraryVersions() {
  await ensureInitialLibraryVersion();
  return prisma.engagementLibraryVersion.findMany({
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      versionLabel: true,
      publishedAt: true,
      changelog: true,
      isCurrent: true,
      createdAt: true,
    },
  });
}

async function resolveServiceRows(
  tenantId: string,
  serviceConfig: Array<{ serviceId?: string; name?: string }>
) {
  const serviceIds = serviceConfig
    .map((s) => s.serviceId)
    .filter((id): id is string => Boolean(id));

  const catalogue =
    serviceIds.length > 0
      ? await prisma.serviceTemplate.findMany({
          where: { tenantId, id: { in: serviceIds } },
          select: { id: true, name: true, tags: true },
        })
      : [];

  const byId = new Map(catalogue.map((s) => [s.id, s]));

  return serviceConfig.map((row) => {
    const match = row.serviceId ? byId.get(row.serviceId) : undefined;
    return {
      name: row.name || match?.name || '',
      tags: match?.tags,
    };
  });
}

export async function isProposalTemplateAffected(
  tenantId: string,
  template: {
    serviceConfig: string;
    terms: string | null;
    engagementLibraryVersionId: string | null;
  },
  changedClauseIds: Set<string>,
  newClauses: EngagementClause[]
): Promise<boolean> {
  if (changedClauseIds.size === 0) return false;

  const alwaysChanged = newClauses
    .filter((c) => c.tags.includes('_always'))
    .some((c) => changedClauseIds.has(c.id));

  if (template.terms?.trim() && alwaysChanged) {
    return true;
  }

  const serviceConfig = parseServiceConfig(template.serviceConfig);
  if (!serviceConfig.length) {
    return Boolean(template.terms?.trim()) && changedClauseIds.size > 0;
  }

  const serviceRows = await resolveServiceRows(tenantId, serviceConfig);
  const selected = selectClausesForServices(serviceRows);
  return selected.some((c) => changedClauseIds.has(c.id));
}

export async function flagAffectedTemplates(
  previousVersionId: string | null,
  newVersionId: string,
  newClauses: EngagementClause[],
  oldClauses: EngagementClause[]
) {
  const changedClauseIds = diffClauseLibraries(oldClauses, newClauses);
  if (changedClauseIds.size === 0) {
    return { proposalTemplatesFlagged: 0, coverLetterTemplatesFlagged: 0, changedClauseIds: [] };
  }

  const proposalTemplates = await prisma.proposalTemplate.findMany({
    where: {
      isActive: true,
      OR: [
        { engagementLibraryVersionId: null },
        ...(previousVersionId ? [{ engagementLibraryVersionId: previousVersionId }] : []),
      ],
    },
    select: {
      id: true,
      tenantId: true,
      serviceConfig: true,
      terms: true,
      engagementLibraryVersionId: true,
    },
  });

  let proposalFlagged = 0;
  for (const template of proposalTemplates) {
    const affected = await isProposalTemplateAffected(
      template.tenantId,
      template,
      changedClauseIds,
      newClauses
    );
    if (affected) {
      await prisma.proposalTemplate.update({
        where: { id: template.id },
        data: { needsUpdate: true },
      });
      proposalFlagged += 1;
    }
  }

  const coverResult = await prisma.coverLetterTemplate.updateMany({
    where: {
      OR: [
        { engagementLibraryVersionId: null },
        ...(previousVersionId ? [{ engagementLibraryVersionId: previousVersionId }] : []),
      ],
    },
    data: { needsUpdate: true },
  });

  return {
    proposalTemplatesFlagged: proposalFlagged,
    coverLetterTemplatesFlagged: coverResult.count,
    changedClauseIds: Array.from(changedClauseIds),
  };
}

export async function publishLibraryVersion(input: {
  versionLabel: string;
  changelog?: string;
  clauses?: EngagementClause[];
  publishedByUserId?: string;
}) {
  const clauses = input.clauses?.length ? input.clauses : getLiveClauseLibrary();
  if (!clauses.length) {
    throw new ApiError('VALIDATION_ERROR', 'Clause library cannot be empty', 400);
  }

  const existingLabel = await prisma.engagementLibraryVersion.findUnique({
    where: { versionLabel: input.versionLabel },
  });
  if (existingLabel) {
    throw new ApiError('CONFLICT', `Version ${input.versionLabel} already exists`, 409);
  }

  const previousCurrent = await prisma.engagementLibraryVersion.findFirst({
    where: { isCurrent: true },
    orderBy: { publishedAt: 'desc' },
  });

  const oldClauses = previousCurrent ? parseClausesJson(previousCurrent.clausesJson) : [];

  const created = await prisma.$transaction(async (tx) => {
    if (previousCurrent) {
      await tx.engagementLibraryVersion.update({
        where: { id: previousCurrent.id },
        data: { isCurrent: false },
      });
    }

    return tx.engagementLibraryVersion.create({
      data: {
        versionLabel: input.versionLabel,
        changelog: input.changelog?.trim() || '',
        clausesJson: JSON.stringify(clauses),
        isCurrent: true,
        publishedAt: new Date(),
      },
    });
  });

  const flagResult = await flagAffectedTemplates(
    previousCurrent?.id ?? null,
    created.id,
    clauses,
    oldClauses
  );

  if (input.publishedByUserId) {
    const publisher = await prisma.user.findFirst({
      where: { id: input.publishedByUserId },
      select: { tenantId: true },
    });
    if (publisher?.tenantId) {
      await prisma.activityLog.create({
        data: {
          tenantId: publisher.tenantId,
          userId: input.publishedByUserId,
          action: 'ENGAGEMENT_LIBRARY_PUBLISHED',
          entityType: 'ENGAGEMENT_LIBRARY_VERSION',
          entityId: created.id,
          description: `Published engagement library ${input.versionLabel}`,
          metadata: JSON.stringify(flagResult),
        },
      });
    }
  }

  return {
    version: created,
    ...flagResult,
  };
}

export async function getTemplatesNeedingUpdate(tenantId: string) {
  const [proposalTemplates, coverLetterTemplates] = await Promise.all([
    prisma.proposalTemplate.findMany({
      where: { tenantId, isActive: true, needsUpdate: true },
      select: {
        id: true,
        name: true,
        updatedAt: true,
        engagementLibraryVersion: { select: { versionLabel: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.coverLetterTemplate.findMany({
      where: { tenantId, needsUpdate: true },
      select: {
        id: true,
        name: true,
        updatedAt: true,
        engagementLibraryVersion: { select: { versionLabel: true } },
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  return {
    proposalTemplates,
    coverLetterTemplates,
    totalCount: proposalTemplates.length + coverLetterTemplates.length,
  };
}

export async function getCurrentVersionId(): Promise<string | null> {
  await ensureInitialLibraryVersion();
  const current = await prisma.engagementLibraryVersion.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });
  return current?.id ?? null;
}

export function getQuarterNumber(date: Date): number {
  return Math.floor(date.getMonth() / 3) + 1;
}

export function getQuarterlyVersionLabel(date = new Date()): string {
  return `${date.getFullYear()}.Q${getQuarterNumber(date)}`;
}

/** First calendar day of the next quarter (UK English copy: "quarterly review"). */
export function getNextQuarterlyReviewDate(from = new Date()): Date {
  const year = from.getFullYear();
  const month = from.getMonth();
  const quarterStartMonths = QUARTER_REVIEW_MONTHS;

  for (const startMonth of quarterStartMonths) {
    const candidate = new Date(year, startMonth, 1, 9, 0, 0, 0);
    if (candidate.getTime() > from.getTime()) {
      return candidate;
    }
  }

  return new Date(year + 1, 0, 1, 9, 0, 0, 0);
}

export function isQuarterlyReviewDay(date = new Date()): boolean {
  return date.getDate() === 1 && QUARTER_REVIEW_MONTHS.includes(date.getMonth());
}

export type QuarterlyReleaseResult =
  | {
      skipped: true;
      reason: string;
      version: Awaited<ReturnType<typeof publishLibraryVersion>>['version'];
      proposalTemplatesFlagged: number;
      coverLetterTemplatesFlagged: number;
      changedClauseIds: string[];
    }
  | {
      skipped: false;
      versionLabel: string;
      version: Awaited<ReturnType<typeof publishLibraryVersion>>['version'];
      proposalTemplatesFlagged: number;
      coverLetterTemplatesFlagged: number;
      changedClauseIds: string[];
    };

export async function publishQuarterlyLibraryRelease(input?: {
  publishedByUserId?: string;
  simulated?: boolean;
  asOf?: Date;
}): Promise<QuarterlyReleaseResult> {
  const asOf = input?.asOf ?? new Date();
  const versionLabel = getQuarterlyVersionLabel(asOf);
  const quarter = getQuarterNumber(asOf);
  const year = asOf.getFullYear();

  const existing = await prisma.engagementLibraryVersion.findUnique({
    where: { versionLabel },
  });
  if (existing) {
    return {
      skipped: true as const,
      reason: `Version ${versionLabel} already published`,
      version: existing,
      proposalTemplatesFlagged: 0,
      coverLetterTemplatesFlagged: 0,
      changedClauseIds: [] as string[],
    };
  }

  const previousCurrent = await prisma.engagementLibraryVersion.findFirst({
    where: { isCurrent: true },
    orderBy: { publishedAt: 'desc' },
  });

  const clauses = getLiveClauseLibrary();
  const changelog = input?.simulated
    ? `Simulated quarterly LOE content release for ${year} Q${quarter} — cloned ${clauses.length} clauses from the live library (admin test).`
    : `Quarterly LOE content release for ${year} Q${quarter} — ${clauses.length} clauses cloned from the current engagement library with version bump.`;

  const result = await publishLibraryVersion({
    versionLabel,
    changelog,
    clauses,
    publishedByUserId: input?.publishedByUserId,
  });

  return {
    skipped: false as const,
    versionLabel,
    version: result.version,
    proposalTemplatesFlagged: result.proposalTemplatesFlagged,
    coverLetterTemplatesFlagged: result.coverLetterTemplatesFlagged,
    changedClauseIds: result.changedClauseIds,
  };
}

export async function getQuarterlySchedule() {
  const now = new Date();
  const nextReview = getNextQuarterlyReviewDate(now);
  const currentQuarterLabel = getQuarterlyVersionLabel(now);

  const existingCurrentQuarter = await prisma.engagementLibraryVersion.findUnique({
    where: { versionLabel: currentQuarterLabel },
    select: { id: true, versionLabel: true, publishedAt: true },
  });

  return {
    nextQuarterlyReview: nextReview.toISOString(),
    currentQuarterLabel,
    currentQuarterPublished: Boolean(existingCurrentQuarter),
    currentQuarterPublishedAt: existingCurrentQuarter?.publishedAt?.toISOString() ?? null,
    isReviewDayToday: isQuarterlyReviewDay(now),
  };
}
