/**
 * Job templates — editable phase/checklist blueprints used to spawn Jobs
 * (directly, or via JobRecurrence). Every lookup is tenant-scoped; a row
 * that exists but belongs to another tenant is treated identically to a
 * row that doesn't exist (404, never leaking existence — see task-1 review).
 */
import { prisma } from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import { resolveCategoryTemplate } from './jobPhaseTemplates.js';

// ==================== Shared DTO ====================

export interface TemplateChecklistItemInput {
  label: string;
  sortOrder: number;
}

export interface TemplatePhaseInput {
  name: string;
  sortOrder: number;
  items: TemplateChecklistItemInput[];
}

export interface TemplateInput {
  name: string;
  description?: string | null;
  serviceCategory?: string | null;
  isActive?: boolean;
  phases: TemplatePhaseInput[];
}

export type JobTemplateChecklistItemDto = {
  id: string;
  label: string;
  sortOrder: number;
};

export type JobTemplatePhaseDto = {
  id: string;
  name: string;
  sortOrder: number;
  items: JobTemplateChecklistItemDto[];
};

export type JobTemplateDto = {
  id: string;
  name: string;
  description: string | null;
  serviceCategory: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  phases: JobTemplatePhaseDto[];
};

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  serviceCategory: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  phases: {
    id: string;
    name: string;
    sortOrder: number;
    items: { id: string; label: string; sortOrder: number }[];
  }[];
};

const TEMPLATE_INCLUDE = {
  phases: {
    orderBy: { sortOrder: 'asc' as const },
    include: { items: { orderBy: { sortOrder: 'asc' as const } } },
  },
} as const;

function toDto(row: TemplateRow): JobTemplateDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    serviceCategory: row.serviceCategory,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    phases: row.phases.map((phase) => ({
      id: phase.id,
      name: phase.name,
      sortOrder: phase.sortOrder,
      items: phase.items.map((item) => ({
        id: item.id,
        label: item.label,
        sortOrder: item.sortOrder,
      })),
    })),
  };
}

function phasesCreateData(phases: TemplatePhaseInput[]) {
  return phases.map((phase) => ({
    name: phase.name,
    sortOrder: phase.sortOrder,
    items: {
      create: phase.items.map((item) => ({ label: item.label, sortOrder: item.sortOrder })),
    },
  }));
}

function validateTemplateInput(input: TemplateInput): void {
  if (!input.name?.trim()) {
    throw new ApiError('VALIDATION_ERROR', 'Template name is required', 400);
  }
  if (!Array.isArray(input.phases)) {
    throw new ApiError('VALIDATION_ERROR', 'Template phases must be an array', 400);
  }
}

async function assertNameAvailable(
  tenantId: string,
  name: string,
  excludeId?: string
): Promise<void> {
  const existing = await prisma.jobTemplate.findFirst({
    where: { tenantId, name, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (existing) {
    throw new ApiError('DUPLICATE_NAME', 'A template with this name already exists', 409);
  }
}

// ==================== listJobTemplates ====================

export async function listJobTemplates(tenantId: string): Promise<JobTemplateDto[]> {
  const rows = await prisma.jobTemplate.findMany({
    where: { tenantId },
    include: TEMPLATE_INCLUDE,
    orderBy: { name: 'asc' },
  });
  return (rows as TemplateRow[]).map(toDto);
}

// ==================== getJobTemplate ====================

export async function getJobTemplate(tenantId: string, id: string): Promise<JobTemplateDto | null> {
  const row = await prisma.jobTemplate.findFirst({
    where: { id, tenantId },
    include: TEMPLATE_INCLUDE,
  });
  return row ? toDto(row as TemplateRow) : null;
}

// ==================== createJobTemplate ====================

export async function createJobTemplate(
  tenantId: string,
  input: TemplateInput
): Promise<JobTemplateDto> {
  validateTemplateInput(input);
  await assertNameAvailable(tenantId, input.name);

  try {
    const created = await prisma.jobTemplate.create({
      data: {
        tenantId,
        name: input.name,
        description: input.description ?? null,
        serviceCategory: input.serviceCategory ?? null,
        isActive: input.isActive ?? true,
        phases: { create: phasesCreateData(input.phases) },
      },
      include: TEMPLATE_INCLUDE,
    });
    return toDto(created as TemplateRow);
  } catch (e: any) {
    if (e?.code === 'P2002') {
      throw new ApiError('DUPLICATE_NAME', 'A template with this name already exists', 409);
    }
    throw e;
  }
}

// ==================== updateJobTemplate ====================

/** Replaces phases/items wholesale — deletes the existing set (cascades items) then recreates, so no orphans are left behind. */
export async function updateJobTemplate(
  tenantId: string,
  id: string,
  input: TemplateInput
): Promise<JobTemplateDto> {
  validateTemplateInput(input);

  const existing = await prisma.jobTemplate.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });
  if (!existing) throw new ApiError('NOT_FOUND', 'Template not found', 404);

  await assertNameAvailable(tenantId, input.name, id);

  const updated = await prisma.$transaction(async (tx: any) => {
    await tx.jobTemplatePhase.deleteMany({ where: { templateId: id } });
    return tx.jobTemplate.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description ?? null,
        serviceCategory: input.serviceCategory ?? null,
        isActive: input.isActive ?? true,
        phases: { create: phasesCreateData(input.phases) },
      },
      include: TEMPLATE_INCLUDE,
    });
  });

  return toDto(updated as TemplateRow);
}

// ==================== deleteJobTemplate ====================

/** Refuses (IN_USE, 409) while an active JobRecurrence references this template. */
export async function deleteJobTemplate(tenantId: string, id: string): Promise<void> {
  const existing = await prisma.jobTemplate.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });
  if (!existing) throw new ApiError('NOT_FOUND', 'Template not found', 404);

  const activeRecurrences = await prisma.jobRecurrence.count({
    where: { templateId: id, isActive: true },
  });
  if (activeRecurrences > 0) {
    throw new ApiError(
      'IN_USE',
      'This template has an active recurrence and cannot be deleted',
      409
    );
  }

  await prisma.jobTemplate.delete({ where: { id } });
}

// ==================== cloneJobTemplate ====================

export async function cloneJobTemplate(
  tenantId: string,
  id: string,
  newName: string
): Promise<JobTemplateDto> {
  const source = await prisma.jobTemplate.findFirst({
    where: { id, tenantId },
    include: TEMPLATE_INCLUDE,
  });
  if (!source) throw new ApiError('NOT_FOUND', 'Template not found', 404);

  await assertNameAvailable(tenantId, newName);

  const sourceRow = source as TemplateRow;
  try {
    const created = await prisma.jobTemplate.create({
      data: {
        tenantId,
        name: newName,
        description: sourceRow.description,
        serviceCategory: sourceRow.serviceCategory,
        isActive: sourceRow.isActive,
        phases: {
          create: phasesCreateData(
            sourceRow.phases.map((phase) => ({
              name: phase.name,
              sortOrder: phase.sortOrder,
              items: phase.items.map((item) => ({
                label: item.label,
                sortOrder: item.sortOrder,
              })),
            }))
          ),
        },
      },
      include: TEMPLATE_INCLUDE,
    });
    return toDto(created as TemplateRow);
  } catch (e: any) {
    if (e?.code === 'P2002') {
      throw new ApiError('DUPLICATE_NAME', 'A template with this name already exists', 409);
    }
    throw e;
  }
}

// ==================== seedDefaultTemplates ====================

/**
 * One-time conversion of the hardcoded jobPhaseTemplates.ts catalogue into
 * editable JobTemplate rows for this tenant. Idempotent: each category is
 * only created if a template of that name doesn't already exist, so running
 * this twice (or after the user has renamed/deleted some) never duplicates.
 * jobPhaseTemplates.ts itself is untouched — proposal-spawned jobs keep
 * falling back to it directly.
 */
const DEFAULT_CATALOGUE_CATEGORIES = [
  'GENERIC',
  'COMPLIANCE',
  'BOOKKEEPING',
  'ADVISORY',
  'MTD_ITSA',
  'SPECIALIST',
  'ONBOARDING',
] as const;

export async function seedDefaultTemplates(tenantId: string): Promise<number> {
  let created = 0;

  for (const category of DEFAULT_CATALOGUE_CATEGORIES) {
    const existing = await prisma.jobTemplate.findFirst({
      where: { tenantId, name: category },
      select: { id: true },
    });
    if (existing) continue;

    const catalogue = resolveCategoryTemplate(category === 'GENERIC' ? null : category);
    await prisma.jobTemplate.create({
      data: {
        tenantId,
        name: category,
        description: null,
        serviceCategory: category === 'GENERIC' ? null : category,
        isActive: true,
        phases: {
          create: catalogue.phases.map((phase, phaseIdx) => ({
            name: phase.name,
            sortOrder: phaseIdx,
            items: {
              create: phase.checklist.map((label, itemIdx) => ({
                label,
                sortOrder: itemIdx,
              })),
            },
          })),
        },
      },
    });
    created++;
  }

  return created;
}
