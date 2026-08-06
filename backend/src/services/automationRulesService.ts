/**
 * Server-side automation rules (W2) stored in Tenant.settings.automationRules.
 * Execution evaluates simple triggers against live jobs/proposals and records runs.
 */

import { prisma } from '../config/database.js';
import { getChasePack, renderChaseTemplate, boardColumnLabel } from './chasePackService.js';
import logger from '../config/logger.js';

export type AutomationRule = {
  id: string;
  trigger: string;
  action: string;
  enabled: boolean;
  source?: string; // pack id or 'custom'
};

export type AutomationRunResult = {
  ruleId: string;
  trigger: string;
  action: string;
  matched: number;
  acted: number;
  /** Entities skipped because the (rule, entity) pair acted within the cooldown window */
  skippedCooldown: number;
  details: string[];
};

function parseSettings(raw: string | null | undefined): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function getAutomationRules(settingsJson?: string | null): AutomationRule[] {
  const s = parseSettings(settingsJson);
  const rules = s.automationRules;
  if (!Array.isArray(rules)) return [];
  return rules
    .filter((r): r is AutomationRule => r && typeof r === 'object' && typeof r.id === 'string')
    .map((r) => ({
      id: String(r.id),
      trigger: String(r.trigger || ''),
      action: String(r.action || ''),
      enabled: r.enabled !== false,
      source: r.source ? String(r.source) : undefined,
    }));
}

export async function saveAutomationRules(
  tenantId: string,
  rules: AutomationRule[]
): Promise<AutomationRule[]> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  const settings = parseSettings(tenant?.settings);
  const cleaned = rules.slice(0, 100).map((r) => ({
    id: r.id || `rule_${Date.now()}`,
    trigger: r.trigger,
    action: r.action,
    enabled: r.enabled !== false,
    source: r.source,
  }));
  settings.automationRules = cleaned;
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: JSON.stringify(settings) },
  });
  return cleaned;
}

/**
 * Cooldown ledger — tenant-scoped: has this (rule, entity) pair acted within
 * the window? Prevents a daily scheduled run from re-firing client-facing
 * actions every day while a trigger condition persists.
 */
async function underCooldown(
  tenantId: string,
  ruleId: string,
  entityId: string,
  days: number
): Promise<boolean> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const prior = await prisma.activityLog.findFirst({
    where: {
      tenantId,
      action: 'AUTOMATION_RULE_ACTED',
      entityId: `${ruleId}:${entityId}`,
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  return Boolean(prior);
}

async function recordActed(
  tenantId: string,
  ruleId: string,
  ruleAction: string,
  entityId: string,
  detail: string
) {
  await prisma.activityLog.create({
    data: {
      action: 'AUTOMATION_RULE_ACTED',
      entityType: 'AutomationRule',
      entityId: `${ruleId}:${entityId}`,
      description: detail,
      metadata: JSON.stringify({ ruleId, action: ruleAction, targetId: entityId }),
      tenantId,
    },
  });
}

/** Dry-run or execute enabled rules for a tenant */
export async function runAutomationRules(
  tenantId: string,
  opts: { dryRun?: boolean; cooldownDays?: number } = {}
): Promise<{ results: AutomationRunResult[]; dryRun: boolean }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true, name: true },
  });
  const rules = getAutomationRules(tenant?.settings).filter((r) => r.enabled);
  const dryRun = opts.dryRun === true;
  const cooldownDays = opts.cooldownDays && opts.cooldownDays > 0 ? opts.cooldownDays : 0;
  const results: AutomationRunResult[] = [];
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  /** Shared gate: true = proceed with the action; false = skip (cooldown). */
  const passesCooldown = async (
    result: AutomationRunResult,
    ruleId: string,
    entityId: string,
    label: string
  ): Promise<boolean> => {
    if (!cooldownDays) return true;
    if (await underCooldown(tenantId, ruleId, entityId, cooldownDays)) {
      result.skippedCooldown += 1;
      result.details.push(`Cooldown skip (${cooldownDays}d) → ${label}`);
      return false;
    }
    return true;
  };

  for (const rule of rules) {
    const result: AutomationRunResult = {
      ruleId: rule.id,
      trigger: rule.trigger,
      action: rule.action,
      matched: 0,
      acted: 0,
      skippedCooldown: 0,
      details: [],
    };

    try {
      if (rule.trigger === 'job.overdue') {
        const jobs = await prisma.job.findMany({
          where: {
            tenantId,
            isActive: true,
            boardColumn: { not: 'COMPLETE' },
            dueAt: { lt: now },
          },
          take: 25,
          include: {
            client: { select: { name: true, contactName: true, contactEmail: true } },
            assignee: { select: { id: true, firstName: true, lastName: true } },
          },
        });
        result.matched = jobs.length;
        for (const job of jobs) {
          if (dryRun) {
            result.details.push(`Would act on ${job.reference} (${job.client.name})`);
            continue;
          }
          if (!(await passesCooldown(result, rule.id, job.id, job.reference))) continue;
          await applyAction(tenantId, rule.action, job, tenant?.name || 'Practice');
          if (cooldownDays) {
            await recordActed(
              tenantId,
              rule.id,
              rule.action,
              job.id,
              `${rule.action} → ${job.reference}`
            );
          }
          result.acted += 1;
          result.details.push(`${rule.action} → ${job.reference}`);
        }
      } else if (rule.trigger.startsWith('job.column.')) {
        const col = rule.trigger.replace('job.column.', '') as any;
        const jobs = await prisma.job.findMany({
          where: { tenantId, isActive: true, boardColumn: col },
          take: 25,
          include: {
            client: { select: { name: true, contactName: true, contactEmail: true } },
            assignee: { select: { id: true, firstName: true, lastName: true } },
          },
        });
        result.matched = jobs.length;
        for (const job of jobs) {
          if (dryRun) {
            result.details.push(`Would act on ${job.reference}`);
            continue;
          }
          if (!(await passesCooldown(result, rule.id, job.id, job.reference))) continue;
          await applyAction(tenantId, rule.action, job, tenant?.name || 'Practice');
          if (cooldownDays) {
            await recordActed(
              tenantId,
              rule.id,
              rule.action,
              job.id,
              `${rule.action} → ${job.reference}`
            );
          }
          result.acted += 1;
          result.details.push(`${rule.action} → ${job.reference}`);
        }
      } else if (rule.trigger === 'proposal.unsigned_7d') {
        const proposals = await prisma.proposal.findMany({
          where: {
            tenantId,
            status: { in: ['SENT', 'VIEWED'] },
            sentAt: { lte: sevenDaysAgo },
          },
          take: 25,
          select: { id: true, reference: true, title: true },
        });
        result.matched = proposals.length;
        for (const p of proposals) {
          if (dryRun) {
            result.details.push(`Would chase proposal ${p.reference}`);
            continue;
          }
          if (!(await passesCooldown(result, rule.id, p.id, p.reference))) continue;
          if (cooldownDays) {
            await recordActed(
              tenantId,
              rule.id,
              rule.action,
              p.id,
              `${rule.action} → ${p.reference}`
            );
          }
          await prisma.activityLog.create({
            data: {
              action: 'AUTOMATION_PROPOSAL_CHASE',
              entityType: 'Proposal',
              entityId: p.id,
              description: `Automation (${rule.action}): unsigned 7d — ${p.reference}`,
              metadata: JSON.stringify({ ruleId: rule.id, action: rule.action }),
              tenantId,
            },
          });
          result.acted += 1;
          result.details.push(`${rule.action} → ${p.reference}`);
        }
      } else if (rule.trigger === 'phase.complete') {
        // Recent phase completions in last 24h
        const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const phases = await prisma.jobPhase.findMany({
          where: {
            isComplete: true,
            completedAt: { gte: since },
            job: { tenantId, isActive: true },
          },
          take: 25,
          include: {
            job: {
              include: {
                client: { select: { name: true, contactName: true, contactEmail: true } },
                assignee: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
        });
        result.matched = phases.length;
        for (const ph of phases) {
          if (dryRun) {
            result.details.push(`Would act on phase ${ph.name} / ${ph.job.reference}`);
            continue;
          }
          if (!(await passesCooldown(result, rule.id, ph.id, `${ph.job.reference}/${ph.name}`)))
            continue;
          await applyAction(tenantId, rule.action, ph.job, tenant?.name || 'Practice', ph.name);
          if (cooldownDays) {
            await recordActed(
              tenantId,
              rule.id,
              rule.action,
              ph.id,
              `${rule.action} → ${ph.job.reference} / ${ph.name}`
            );
          }
          result.acted += 1;
          result.details.push(`${rule.action} → ${ph.job.reference} / ${ph.name}`);
        }
      } else if (rule.trigger === 'document_request.stale') {
        // Sent document requests still OPEN with nothing received for 3+ days.
        // sentCount >= 1 excludes drafts the practice never sent; resend
        // updates lastSentAt, so this is self-limiting even without cooldown.
        const staleBefore = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
        const requests = await prisma.documentRequest.findMany({
          where: {
            tenantId,
            status: 'OPEN',
            sentCount: { gte: 1 },
            lastSentAt: { lte: staleBefore },
          },
          take: 25,
          select: { id: true, title: true, client: { select: { name: true } } },
        });
        result.matched = requests.length;
        for (const reqRow of requests) {
          const label = `${reqRow.title} (${reqRow.client.name})`;
          if (dryRun) {
            result.details.push(`Would resend document request: ${label}`);
            continue;
          }
          if (rule.action !== 'resend_document_request') {
            result.details.push(`Unsupported action ${rule.action} for ${rule.trigger}`);
            break;
          }
          if (!(await passesCooldown(result, rule.id, reqRow.id, label))) continue;
          const { resendDocumentRequest } = await import('./documentRequestService.js');
          await resendDocumentRequest({ tenantId, requestId: reqRow.id });
          if (cooldownDays) {
            await recordActed(tenantId, rule.id, rule.action, reqRow.id, `resend → ${label}`);
          }
          result.acted += 1;
          result.details.push(`resend_document_request → ${label}`);
        }
      } else {
        result.details.push(`Unknown trigger: ${rule.trigger}`);
      }
    } catch (e: any) {
      logger.warn(`Automation rule ${rule.id} failed: ${e?.message}`);
      result.details.push(`Error: ${e?.message || 'failed'}`);
    }

    results.push(result);
  }

  if (!dryRun && results.some((r) => r.acted > 0)) {
    await prisma.activityLog.create({
      data: {
        action: 'AUTOMATION_RUN',
        entityType: 'Tenant',
        entityId: tenantId,
        description: `Automation run: ${results.reduce((s, r) => s + r.acted, 0)} actions`,
        metadata: JSON.stringify({
          results: results.map((r) => ({ ...r, details: r.details.slice(0, 5) })),
        }),
        tenantId,
      },
    });
  }

  return { results, dryRun };
}

async function applyAction(
  tenantId: string,
  action: string,
  job: {
    id: string;
    title: string;
    reference: string;
    boardColumn: string;
    dueAt: Date | null;
    client: { name: string; contactName: string | null; contactEmail: string };
    assignee: { id: string; firstName: string; lastName: string } | null;
  },
  practiceName: string,
  phaseName?: string
) {
  if (action.startsWith('chase.')) {
    const packId = action.replace('chase.', '');
    const pack = getChasePack(packId) || getChasePack('INFO_NUDGE');
    if (pack) {
      const vars = {
        contact_name: job.client.contactName || 'Client',
        client_name: job.client.name,
        job_title: job.title,
        practice_name: practiceName,
        due_date: job.dueAt?.toLocaleDateString('en-GB') || null,
        phase_name: phaseName || null,
        board_column: boardColumnLabel(job.boardColumn),
      };
      const subject = renderChaseTemplate(pack.subject, vars);
      await prisma.jobActivity.create({
        data: {
          kind: 'NOTE',
          message: `Automation drafted chase (${pack.name}): ${subject}`,
          jobId: job.id,
          metadata: JSON.stringify({ automation: true, packId: pack.id, action }),
        },
      });
    }
    return;
  }

  if (action === 'notify.assignee' && job.assignee) {
    await prisma.activityLog.create({
      data: {
        action: 'AUTOMATION_NOTIFY',
        entityType: 'Job',
        entityId: job.id,
        description: `Automation: notify ${job.assignee.firstName} on ${job.reference}`,
        metadata: JSON.stringify({ assigneeId: job.assignee.id }),
        tenantId,
        userId: job.assignee.id,
      },
    });
    await prisma.jobActivity.create({
      data: {
        kind: 'NOTE',
        message: `Automation notified assignee ${job.assignee.firstName} ${job.assignee.lastName}`,
        jobId: job.id,
        metadata: JSON.stringify({ automation: true, action }),
      },
    });
    return;
  }

  if (action === 'clara.rewrite') {
    await prisma.jobActivity.create({
      data: {
        kind: 'NOTE',
        message: 'Automation queued Clara rewrite for last chase draft (open job → Clara draft)',
        jobId: job.id,
        metadata: JSON.stringify({ automation: true, action: 'clara.rewrite' }),
      },
    });
    return;
  }

  await prisma.jobActivity.create({
    data: {
      kind: 'NOTE',
      message: `Automation ran action: ${action}`,
      jobId: job.id,
      metadata: JSON.stringify({ automation: true, action }),
    },
  });
}
