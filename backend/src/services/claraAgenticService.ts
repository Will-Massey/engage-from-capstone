/**
 * Clara agentic drafting (R5.1) — Clara watches the client book and prepares
 * work for humans instead of just flagging it.
 *
 * Hard safety ceiling (do not relax): Clara drafts, prices, and queues
 * proposals into the existing partner-approval workflow. She NEVER sends,
 * never touches non-draft proposals, and the LLM writes narrative prose only —
 * deterministic rules and the pricing engine decide every fact and price.
 * Per-tenant opt-in via the `clara` settings namespace (default OFF).
 *
 * Triggers:
 *  - OPEN RegulatorySignal rows (warning/action_required) in enabled families
 *    → net-new DRAFT proposal from matching tenant service templates, queued
 *    PENDING approval, signal transitioned to ACTIONED (its reserved state).
 *  - Accepted contracts nearing renewal → renewal DRAFT via
 *    createRenewalDraft with archiveOriginal:false, queued PENDING approval;
 *    the original is archived only when a human approves the renewal.
 */
import { UserRole } from '@prisma/client';
import { prisma } from '../config/database.js';
import logger from '../config/logger.js';
import { ApiError } from '../middleware/errorHandler.js';
import { getClaraSettings, type ClaraSettings } from '../utils/tenantClaraSettings.js';
import {
  addDays,
  formatPaymentTerms,
  getProposalSettings,
  type ProposalSettings,
} from '../utils/tenantProposalSettings.js';
import {
  buildProposalServiceRecord,
  calculateHeaderTotals,
  penceToPounds,
  type BuiltProposalService,
} from '../utils/proposalPricing.js';
import {
  ACCOUNTS_SERVICE_PATTERN,
  CONFIRMATION_STATEMENT_SERVICE_PATTERN,
  PAYROLL_SERVICE_PATTERN,
  VAT_SERVICE_PATTERN,
  hasAccountsCoverage,
  hasConfirmationStatementCoverage,
  hasPayrollCoverage,
  hasVatReturnCoverage,
  type EngagedService,
} from './regulatoryRules.js';
import { getEngagedServiceNames } from './engagedServices.js';
import {
  chatCompletion,
  checkAiTokenBudget,
  isAiConfigured,
  tokenMetaFromUsage,
} from './ai/aiClient.js';
import { logAiUsage, UK_SYSTEM } from './ai/proposalAiService.js';
import { createRenewalDraft, findRenewalCandidates } from './renewalProposalService.js';
import { resolveProposalTerms } from './proposalTermsService.js';

/** Mirrors MTD_SERVICE_PATTERNS in regulatoryFitService.ts (module-private there). */
const MTD_SERVICE_PATTERN = /mtd|making tax digital/i;

const generateReference = (prefix: string = 'PROP'): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

/** Library names Clara prefers when several templates match a family regex. */
const PREFERRED_TEMPLATE_NAMES = [
  'vat return preparation',
  'mtd itsa quarterly return',
  'confirmation statement (cs01)',
  'monthly payroll processing',
];

const FAMILY_TITLES: Record<string, string> = {
  vat: 'VAT services',
  mtd_itsa: 'MTD ITSA services',
  filing_deadlines: 'Compliance filing services',
  payroll: 'Payroll services',
};

export interface ClaraSignalLike {
  family: string;
  ruleId: string;
}

/**
 * Service-name regexes that identify templates able to action a signal.
 * Reuses the R5.2 coverage matchers; filing_deadlines narrows by ruleId.
 */
export function templatePatternsForSignal(signal: ClaraSignalLike): RegExp[] {
  switch (signal.family) {
    case 'vat':
      return [VAT_SERVICE_PATTERN];
    case 'mtd_itsa':
      return [MTD_SERVICE_PATTERN];
    case 'payroll':
      return [PAYROLL_SERVICE_PATTERN];
    case 'filing_deadlines':
      if (signal.ruleId.includes('confirmation-statement')) {
        return [CONFIRMATION_STATEMENT_SERVICE_PATTERN];
      }
      if (signal.ruleId.includes('accounts')) return [ACCOUNTS_SERVICE_PATTERN];
      if (signal.ruleId.includes('vat')) return [VAT_SERVICE_PATTERN];
      return [ACCOUNTS_SERVICE_PATTERN, CONFIRMATION_STATEMENT_SERVICE_PATTERN];
    default:
      return [];
  }
}

/**
 * Pick the 1-2 most relevant active tenant templates for a signal. Name-regex
 * matching only — the catalog category enum is unreliable (VAT/payroll
 * templates are frequently categorised COMPLIANCE). Exact library names win,
 * then original catalog order (stable sort).
 */
export function matchTemplatesForSignal<T extends { id: string; name: string }>(
  signal: ClaraSignalLike,
  templates: T[]
): T[] {
  const patterns = templatePatternsForSignal(signal);
  if (patterns.length === 0) return [];
  const matches = templates.filter((t) => patterns.some((p) => p.test(t.name)));
  return matches
    .map((template, index) => ({
      template,
      preferred: PREFERRED_TEMPLATE_NAMES.includes(template.name.trim().toLowerCase()),
      index,
    }))
    .sort((a, b) => Number(b.preferred) - Number(a.preferred) || a.index - b.index)
    .slice(0, 2)
    .map((m) => m.template);
}

/** Does the client already engage a service that covers this signal? */
export function clientAlreadyCovered(signal: ClaraSignalLike, engaged: EngagedService[]): boolean {
  switch (signal.family) {
    case 'vat':
      return hasVatReturnCoverage(engaged);
    case 'mtd_itsa':
      return engaged.some((s) => MTD_SERVICE_PATTERN.test(s.name));
    case 'payroll':
      return hasPayrollCoverage(engaged);
    case 'filing_deadlines':
      if (signal.ruleId.includes('confirmation-statement')) {
        return hasConfirmationStatementCoverage(engaged);
      }
      if (signal.ruleId.includes('accounts')) return hasAccountsCoverage(engaged);
      if (signal.ruleId.includes('vat')) return hasVatReturnCoverage(engaged);
      return false;
    default:
      return false;
  }
}

const OWNER_ROLE_PRIORITY: UserRole[] = ['ADMIN', 'PARTNER', 'MD'];

/**
 * Resolve who owns Clara's net-new drafts (Proposal.createdById is required
 * and no system user exists): explicit settings override first, else the
 * tenant's first active ADMIN, then PARTNER, then MD.
 */
export async function resolveDraftOwner(
  tenantId: string,
  settings: ClaraSettings
): Promise<{ id: string } | null> {
  if (settings.draftOwnerUserId) {
    const configured = await prisma.user.findFirst({
      where: { id: settings.draftOwnerUserId, tenantId, isActive: true },
      select: { id: true },
    });
    if (configured) return configured;
  }

  const candidates = await prisma.user.findMany({
    where: { tenantId, isActive: true, role: { in: OWNER_ROLE_PRIORITY } },
    select: { id: true, role: true },
    orderBy: { createdAt: 'asc' },
  });
  for (const role of OWNER_ROLE_PRIORITY) {
    const match = candidates.find((u) => u.role === role);
    if (match) return { id: match.id };
  }
  return null;
}

/** Deterministic cover letter used whenever the LLM is unavailable or over budget. */
export function buildFallbackCoverLetter(
  clientName: string,
  signal: { title: string; detail: string },
  services: Array<{ name: string }>
): string {
  const serviceList = services.map((s) => `- ${s.name}`).join('\n');
  return (
    `Dear ${clientName},\n\n` +
    `Our ongoing compliance monitoring has identified the following: ${signal.title}. ` +
    `${signal.detail}\n\n` +
    `To keep you fully covered, we propose the following service${services.length === 1 ? '' : 's'}:\n` +
    `${serviceList}\n\n` +
    `The fees are set out in this proposal. If you would like to talk anything through ` +
    `before going ahead, we would be very happy to help.`
  );
}

export interface ClaraDraftingSummary {
  tenantId: string;
  enabled: boolean;
  signalDrafts: number;
  renewalDrafts: number;
  skipped: number;
  errors: number;
}

interface SignalDraftContext {
  tenantId: string;
  ownerId: string;
  settings: ClaraSettings;
  proposalSettings: ProposalSettings;
  now: Date;
}

type SignalWithClient = {
  id: string;
  clientId: string;
  ruleId: string;
  family: string;
  severity: string;
  title: string;
  detail: string;
  metadata: string;
  client: { id: string; name: string };
};

type TemplateRecord = {
  id: string;
  name: string;
  description: string | null;
  priceAmount: number | null;
  basePrice: number | null;
  billingCycle: string | null;
  defaultFrequency: string | null;
  tags?: string | null;
};

function parseOneOffDueDate(billingFrequency: string, raw: unknown): Date | null {
  if (billingFrequency !== 'ONE_TIME') return null;
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00.000Z`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * AI cover-letter prose for a signal draft. The prompt carries the trigger and
 * the already-priced service lines as fixed facts; the response is consumed as
 * cover-letter text ONLY — never for services, prices, or totals.
 */
async function generateSignalCoverLetter(
  ctx: SignalDraftContext,
  signal: SignalWithClient,
  services: BuiltProposalService[]
): Promise<{ coverLetter: string; ai: boolean }> {
  const fallback = buildFallbackCoverLetter(signal.client.name, signal, services);

  if (!ctx.settings.useAiCoverLetter || !isAiConfigured()) {
    return { coverLetter: fallback, ai: false };
  }

  try {
    const budget = await checkAiTokenBudget(ctx.tenantId);
    if (!budget.withinBudget) {
      return { coverLetter: fallback, ai: false };
    }

    const serviceLines = services
      .map(
        (s) =>
          `- ${s.name}: £${penceToPounds(s.displayPricePence).toFixed(2)} (${s.billingFrequency})`
      )
      .join('\n');
    const completion = await chatCompletion(
      [
        { role: 'system', content: UK_SYSTEM },
        {
          role: 'user',
          content:
            `Write a 2-3 paragraph proposal cover letter for ${signal.client.name}.\n` +
            `Trigger (fixed facts — restate, never alter): ${signal.title}. ${signal.detail}\n` +
            `Proposed services with fixed prices (do not change or invent any figures):\n` +
            `${serviceLines}\n` +
            `Warm, professional UK accountancy tone. Plain text, no subject line, no signature block.`,
        },
      ],
      { temperature: 0.5, maxTokens: 700 }
    );
    await logAiUsage(ctx.tenantId, ctx.ownerId, 'clara_agentic_draft', {
      signalId: signal.id,
      ruleId: signal.ruleId,
      ...tokenMetaFromUsage(completion.usage),
    });
    return { coverLetter: completion.content, ai: true };
  } catch {
    // AI is optional — the deterministic letter stands.
    return { coverLetter: fallback, ai: false };
  }
}

async function draftProposalForSignal(
  ctx: SignalDraftContext,
  signal: SignalWithClient,
  templates: TemplateRecord[]
): Promise<void> {
  const { tenantId, ownerId, proposalSettings, now } = ctx;

  // Deterministic pricing — template price as-is through the pricing engine.
  const builtServices = templates.map((template) =>
    buildProposalServiceRecord({ serviceId: template.id }, template, parseOneOffDueDate)
  );
  const totals = calculateHeaderTotals(builtServices);
  const title = `${FAMILY_TITLES[signal.family] ?? 'Regulatory services'} — ${signal.client.name}`;

  const { coverLetter, ai: aiCoverLetter } = await generateSignalCoverLetter(
    ctx,
    signal,
    builtServices
  );

  const proposal = await prisma.proposal.create({
    data: {
      reference: generateReference('PROP'),
      title,
      tenantId,
      clientId: signal.clientId,
      createdById: ownerId,
      status: 'DRAFT',
      // Straight into the partner-approval queue (schema permits PENDING at create).
      approvalStatus: 'PENDING',
      submittedForApprovalAt: now,
      validUntil: addDays(now, proposalSettings.defaultExpiryDays),
      vatRate: 20,
      subtotalPence: totals.subtotalPence,
      discountAmountPence: 0,
      vatAmountPence: totals.vatAmountPence,
      totalPence: totals.totalPence,
      paymentTerms: formatPaymentTerms(proposalSettings.defaultPaymentTermsDays),
      paymentFrequency: 'MONTHLY',
      coverLetter,
      terms: await resolveProposalTerms(
        tenantId,
        templates.map((t) => ({ name: t.name, tags: t.tags ?? null }))
      ),
      notes:
        `Drafted by Clara from regulatory signal ${signal.ruleId}: ${signal.title}. ` +
        `${signal.detail}`,
      services: {
        create: builtServices as never,
      },
    },
  });

  await prisma.activityLog.create({
    data: {
      tenantId,
      userId: ownerId,
      proposalId: proposal.id,
      action: 'CLARA_DRAFT_CREATED',
      entityType: 'PROPOSAL',
      entityId: proposal.id,
      description: `Clara drafted "${title}" from a regulatory signal — awaiting approval`,
      metadata: JSON.stringify({
        signalId: signal.id,
        ruleId: signal.ruleId,
        proposalId: proposal.id,
        aiCoverLetter,
      }),
    },
  });

  // ACTIONED is Clara's reserved state: the scan bumps it while still firing
  // and resolves it when the underlying condition clears. Merge the proposal
  // pointer into the signal metadata — never clobber the rule context.
  let signalMeta: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(signal.metadata || '{}');
    if (parsed && typeof parsed === 'object') signalMeta = parsed as Record<string, unknown>;
  } catch {
    // keep empty metadata
  }
  await prisma.regulatorySignal.update({
    where: { id: signal.id },
    data: {
      status: 'ACTIONED',
      lastEvaluatedAt: now,
      metadata: JSON.stringify({
        ...signalMeta,
        proposalId: proposal.id,
        actionedByClaraAt: now.toISOString(),
      }),
    },
  });
}

/**
 * One tenant's agentic drafting pass. No-op unless the tenant has opted in.
 * Each draft is individually try/caught so a single failure never halts the
 * run. Idempotency: signals are only drafted from OPEN (the ACTIONED
 * transition stops re-drafting) and renewals are guarded by
 * hasPendingRenewal + the RENEWAL_EXISTS duplicate check.
 */
export async function runClaraDraftingForTenant(
  tenantId: string,
  now: Date = new Date()
): Promise<ClaraDraftingSummary> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  const settings = getClaraSettings(tenant?.settings);

  const summary: ClaraDraftingSummary = {
    tenantId,
    enabled: settings.agenticDraftingEnabled,
    signalDrafts: 0,
    renewalDrafts: 0,
    skipped: 0,
    errors: 0,
  };
  if (!settings.agenticDraftingEnabled) return summary;

  const owner = await resolveDraftOwner(tenantId, settings);
  if (!owner) {
    logger.warn(
      `Clara drafting skipped for tenant ${tenantId} — no active ADMIN/PARTNER/MD to own drafts`
    );
    return summary;
  }

  const proposalSettings = getProposalSettings(tenant?.settings);
  let budget = settings.maxDraftsPerRun;
  const ctx: SignalDraftContext = { tenantId, ownerId: owner.id, settings, proposalSettings, now };

  // --- Regulatory-signal drafts (oldest first) ---
  if (settings.draftRegulatoryFamilies.length > 0) {
    const signals = (await prisma.regulatorySignal.findMany({
      where: {
        tenantId,
        status: 'OPEN',
        severity: { in: ['warning', 'action_required'] },
        family: { in: settings.draftRegulatoryFamilies },
      },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { firstRaisedAt: 'asc' },
    })) as SignalWithClient[];

    const templates =
      signals.length > 0
        ? ((await prisma.serviceTemplate.findMany({
            where: { tenantId, isActive: true },
          })) as TemplateRecord[])
        : [];

    for (const signal of signals) {
      if (budget <= 0) break;
      try {
        const matched = matchTemplatesForSignal(signal, templates);
        if (matched.length === 0) {
          logger.info(
            `Clara: no active service template matches signal rule ${signal.ruleId} for tenant ${tenantId} — skipped`
          );
          summary.skipped += 1;
          continue;
        }

        // The scan's coverage rules already imply a gap, but re-verify from
        // accepted proposals — never propose a service the client already has.
        const engaged = await getEngagedServiceNames(tenantId, signal.clientId);
        if (clientAlreadyCovered(signal, engaged)) {
          logger.info(
            `Clara: client already engages a covering service for rule ${signal.ruleId} (tenant ${tenantId}) — skipped`
          );
          summary.skipped += 1;
          continue;
        }

        await draftProposalForSignal(ctx, signal, matched);
        summary.signalDrafts += 1;
        budget -= 1;
      } catch (err) {
        summary.errors += 1;
        logger.error(`Clara: signal draft failed (signal ${signal.id}, tenant ${tenantId}):`, err);
      }
    }
  }

  // --- Renewal drafts ---
  if (settings.draftRenewals && budget > 0) {
    const candidates = await findRenewalCandidates({
      tenantId,
      expiringBefore: addDays(now, proposalSettings.renewalReminderDays),
    });

    for (const candidate of candidates) {
      if (budget <= 0) break;
      if (candidate.hasPendingRenewal) {
        summary.skipped += 1;
        continue;
      }
      try {
        // Renewals are attributed to the original proposal's creator.
        const original = await prisma.proposal.findFirst({
          where: { id: candidate.proposalId, tenantId },
          select: { id: true, createdById: true },
        });
        if (!original) {
          summary.skipped += 1;
          continue;
        }

        const renewal = await createRenewalDraft(tenantId, original.createdById, original.id, {
          upliftPercent: settings.renewalUpliftPercent,
          useAiCoverLetter: settings.useAiCoverLetter && isAiConfigured(),
          bulkRenewal: true,
          // Keep the accepted original live until a human approves the renewal
          // (deferred archive in routes/proposals/approvals.ts).
          archiveOriginal: false,
        });

        await prisma.proposal.update({
          where: { id: renewal.id },
          data: { approvalStatus: 'PENDING', submittedForApprovalAt: now },
        });

        await prisma.activityLog.create({
          data: {
            tenantId,
            userId: original.createdById,
            proposalId: renewal.id,
            action: 'CLARA_DRAFT_CREATED',
            entityType: 'PROPOSAL',
            entityId: renewal.id,
            description: `Clara drafted renewal "${renewal.title}" — awaiting approval`,
            metadata: JSON.stringify({
              originalProposalId: original.id,
              proposalId: renewal.id,
              renewal: true,
            }),
          },
        });

        summary.renewalDrafts += 1;
        budget -= 1;
      } catch (err) {
        if (err instanceof ApiError && err.code === 'RENEWAL_EXISTS') {
          summary.skipped += 1;
          continue;
        }
        summary.errors += 1;
        logger.error(
          `Clara: renewal draft failed (proposal ${candidate.proposalId}, tenant ${tenantId}):`,
          err
        );
      }
    }
  }

  return summary;
}
