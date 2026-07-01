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