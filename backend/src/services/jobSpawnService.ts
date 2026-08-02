/**
 * Spawn a practice Job when a proposal is fully accepted.
 * Idempotent: one Job per proposalId.
 */
import { prisma } from '../config/database.js';
import logger from '../utils/logger.js';
import {
  inferCategoryFromServiceName,
  resolveCategoryTemplate,
} from './jobPhaseTemplates.js';
import { computeJobDeadline } from './jobDeadlineService.js';

export async function spawnJobForProposal(
  proposalId: string,
  opts?: { actorId?: string | null; tenantId?: string | null }
): Promise<{ jobId: string; created: boolean } | null> {
  const existing = await prisma.job.findUnique({
    where: { proposalId },
    select: { id: true, tenantId: true },
  });
  if (existing) {
    if (opts?.tenantId && existing.tenantId !== opts.tenantId) {
      logger.warn(`jobSpawn: tenant mismatch on existing job for proposal ${proposalId}`);
      return null;
    }
    return { jobId: existing.id, created: false };
  }

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: {
      services: { orderBy: { sortOrder: 'asc' } },
      client: {
        select: {
          id: true,
          name: true,
          yearEnd: true,
          nextVatDueDate: true,
          nextAccountsDueDate: true,
          nextConfirmationStatementDue: true,
        },
      },
      createdBy: { select: { id: true } },
    },
  });

  if (!proposal) {
    logger.warn(`jobSpawn: proposal ${proposalId} not found`);
    return null;
  }

  // Staff/API callers must pass tenantId; public accept path omits it (proposal already gated by share token)
  if (opts?.tenantId && proposal.tenantId !== opts.tenantId) {
    logger.warn(`jobSpawn: tenant mismatch for proposal ${proposalId}`);
    return null;
  }

  if (proposal.status !== 'ACCEPTED') {
    logger.info(`jobSpawn: skip non-accepted proposal ${proposalId} (${proposal.status})`);
    return null;
  }

  const serviceLines = proposal.services.filter((s) => !s.isOptional);
  const lines = serviceLines.length > 0 ? serviceLines : proposal.services;

  const titleParts = lines.map((s) => s.name).filter(Boolean);
  const title =
    titleParts.length > 0
      ? `${proposal.client.name} — ${titleParts.slice(0, 3).join(' + ')}${
          titleParts.length > 3 ? '…' : ''
        }`
      : proposal.title || `Engagement ${proposal.reference}`;

  const proposedFeePence = proposal.totalPence ?? 0;
  // Until cost rates exist, budget mirrors proposed fee (staff can override later)
  const budgetPence = proposedFeePence;

  const deadline = computeJobDeadline({
    serviceNames: lines.map((s) => s.name),
    yearEnd: proposal.client.yearEnd,
    nextVatDueDate: proposal.client.nextVatDueDate,
    nextAccountsDueDate: proposal.client.nextAccountsDueDate,
    nextConfirmationStatementDue: proposal.client.nextConfirmationStatementDue,
  });

  const reference = await nextJobReference(proposal.tenantId);

  const job = await prisma.$transaction(async (tx) => {
    const created = await tx.job.create({
      data: {
        reference,
        title,
        boardColumn: 'REQUEST_RECORDS',
        deadlineKind: deadline.deadlineKind,
        dueAt: deadline.dueAt,
        proposedFeePence,
        budgetPence,
        actualPence: 0,
        tenantId: proposal.tenantId,
        clientId: proposal.clientId,
        proposalId: proposal.id,
        assigneeId: proposal.createdById,
        createdById: opts?.actorId || proposal.createdById,
      },
    });

    let sortOrder = 0;
    for (const line of lines) {
      // Prefer template category if present on linked ServiceTemplate
      let category: string | null = null;
      if (line.serviceTemplateId) {
        const st = await tx.serviceTemplate.findUnique({
          where: { id: line.serviceTemplateId },
          select: { category: true },
        });
        category = st?.category ? String(st.category) : null;
      }
      if (!category) {
        category = inferCategoryFromServiceName(line.name);
      }

      const tmpl = resolveCategoryTemplate(category);
      // One phase block per service line: use first phase name as service label prefix
      for (const phase of tmpl.phases) {
        const phaseRow = await tx.jobPhase.create({
          data: {
            name: lines.length > 1 ? `${line.name}: ${phase.name}` : phase.name,
            sortOrder: sortOrder++,
            jobId: created.id,
            proposalServiceId: line.id,
            serviceCategory: category,
            progressPct: 0,
          },
        });
        let cSort = 0;
        for (const label of phase.checklist) {
          await tx.checklistItem.create({
            data: {
              label,
              sortOrder: cSort++,
              phaseId: phaseRow.id,
            },
          });
        }
      }
    }

    // Fallback if proposal had zero services
    if (lines.length === 0) {
      const tmpl = resolveCategoryTemplate('GENERIC');
      for (const phase of tmpl.phases) {
        const phaseRow = await tx.jobPhase.create({
          data: {
            name: phase.name,
            sortOrder: sortOrder++,
            jobId: created.id,
            serviceCategory: 'GENERIC',
          },
        });
        let cSort = 0;
        for (const label of phase.checklist) {
          await tx.checklistItem.create({
            data: { label, sortOrder: cSort++, phaseId: phaseRow.id },
          });
        }
      }
    }

    await tx.jobActivity.create({
      data: {
        kind: 'SPAWNED',
        message: `Job created from accepted proposal ${proposal.reference}${
          deadline.dueAt
            ? ` · deadline ${deadline.label} ${deadline.dueAt.toISOString().slice(0, 10)}`
            : ''
        }`,
        jobId: created.id,
        actorId: opts?.actorId || proposal.createdById,
        metadata: JSON.stringify({
          proposalId: proposal.id,
          deadlineRuleId: deadline.ruleId,
          deadlineKind: deadline.deadlineKind,
        }),
      },
    });

    return created;
  });

  logger.info(`jobSpawn: created job ${job.id} for proposal ${proposalId}`);

  // Best-effort AccountFlow mesh link (mock by default — never hits prod AF)
  try {
    const { onJobSpawnedMesh } = await import('./accountFlowMeshService.js');
    await onJobSpawnedMesh({
      tenantId: proposal.tenantId,
      jobId: job.id,
      clientId: proposal.clientId,
      proposalId: proposal.id,
    });
  } catch (e) {
    logger.warn('jobSpawn: accountFlow mesh link skipped', e);
  }

  return { jobId: job.id, created: true };
}

async function nextJobReference(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `JOB-${year}-`;
  const latest = await prisma.job.findFirst({
    where: { tenantId, reference: { startsWith: prefix } },
    orderBy: { reference: 'desc' },
    select: { reference: true },
  });
  let seq = 1;
  if (latest?.reference) {
    const n = parseInt(latest.reference.slice(prefix.length), 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}
