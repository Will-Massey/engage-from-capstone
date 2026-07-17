/**
 * Shared renewal proposal logic — single-client create-renewal and bulk renewal wizard.
 */

import { prisma } from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import {
  addDays,
  getProposalSettings,
  parseProposalDateInput,
} from '../utils/tenantProposalSettings.js';
import {
  buildProposalServiceRecord,
  calculateHeaderTotals,
  penceToPounds,
} from '../utils/proposalPricing.js';
import { calculateRenewalDate } from '../jobs/renewalReminders.js';
import { revokeShareableLink } from './proposalSharingService.js';

const generateReference = (prefix: string = 'PROP'): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

function parseOneOffDueDate(billingFrequency: string, raw: unknown): Date | null {
  if (billingFrequency !== 'ONE_TIME') return null;
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00.000Z`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface RenewalCandidate {
  clientId: string;
  clientName: string;
  companyType: string | null;
  proposalId: string;
  proposalReference: string;
  proposalTitle: string;
  renewalDate: string;
  total: number;
  paymentFrequency: string;
  hasPendingRenewal: boolean;
  daysUntilRenewal: number;
}

export interface FindRenewalCandidatesOptions {
  tenantId: string;
  expiringBefore?: Date;
  clientIds?: string[];
}

export interface UpliftRules {
  mode: 'percent' | 'cpi' | 'min_floor';
  percent?: number;
  cpiPercent?: number;
  minFeeGbp?: number;
  perServiceFloors?: Record<string, number>;
}

export interface CreateRenewalDraftOptions {
  upliftPercent?: number;
  upliftRules?: UpliftRules;
  templateId?: string;
  useAiCoverLetter?: boolean;
  bulkRenewal?: boolean;
  /**
   * Archive + supersede the accepted original at draft time (default true).
   * Clara's agentic drafts pass false so the original stays live until a human
   * approves the renewal (see archiveSupersededOriginal + approvals handler).
   */
  archiveOriginal?: boolean;
}

export interface BulkRenewalItemResult {
  clientId: string;
  clientName: string;
  proposalId?: string;
  reference?: string;
  title?: string;
  total?: number;
  reason?: string;
}

export interface BulkRenewalResult {
  created: BulkRenewalItemResult[];
  skipped: BulkRenewalItemResult[];
  failed: BulkRenewalItemResult[];
  summary: {
    requested: number;
    created: number;
    skipped: number;
    failed: number;
  };
}

function effectiveRenewalDate(proposal: {
  renewalDate: Date | null;
  acceptedAt: Date | null;
}): Date | null {
  if (proposal.renewalDate) return proposal.renewalDate;
  if (proposal.acceptedAt) return calculateRenewalDate(proposal.acceptedAt);
  return null;
}

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

async function pendingRenewalProposalIds(tenantId: string): Promise<Set<string>> {
  const pending = await prisma.proposal.findMany({
    where: {
      tenantId,
      isRenewal: true,
      status: { in: ['DRAFT', 'SENT', 'VIEWED'] },
      originalProposalId: { not: null },
    },
    select: { originalProposalId: true },
  });
  return new Set(
    pending.map((p) => p.originalProposalId).filter((id): id is string => Boolean(id))
  );
}

/**
 * Accepted proposals due for renewal before a given date (per client, most urgent first).
 */
export async function findRenewalCandidates(
  options: FindRenewalCandidatesOptions
): Promise<RenewalCandidate[]> {
  const { tenantId, clientIds } = options;
  const expiringBefore =
    options.expiringBefore ?? addDays(new Date(), getProposalSettings().renewalReminderDays);

  const pendingOriginalIds = await pendingRenewalProposalIds(tenantId);

  const proposals = await prisma.proposal.findMany({
    where: {
      tenantId,
      status: 'ACCEPTED',
      isRenewal: false,
      ...(clientIds?.length ? { clientId: { in: clientIds } } : {}),
    },
    include: {
      client: { select: { id: true, name: true, companyType: true } },
      services: { select: { billingFrequency: true } },
    },
    orderBy: [{ renewalDate: 'asc' }, { acceptedAt: 'asc' }],
  });

  const byClient = new Map<string, (typeof proposals)[number]>();

  for (const proposal of proposals) {
    const renewalDate = effectiveRenewalDate(proposal);
    if (!renewalDate || renewalDate > expiringBefore) continue;

    const existing = byClient.get(proposal.clientId);
    if (!existing) {
      byClient.set(proposal.clientId, proposal);
      continue;
    }
    const existingDate = effectiveRenewalDate(existing);
    if (existingDate && renewalDate < existingDate) {
      byClient.set(proposal.clientId, proposal);
    }
  }

  const candidates: RenewalCandidate[] = [];

  for (const proposal of byClient.values()) {
    const renewalDate = effectiveRenewalDate(proposal)!;
    candidates.push({
      clientId: proposal.clientId,
      clientName: proposal.client.name,
      companyType: proposal.client.companyType,
      proposalId: proposal.id,
      proposalReference: proposal.reference,
      proposalTitle: proposal.title,
      renewalDate: renewalDate.toISOString(),
      total: penceToPounds(proposal.totalPence),
      paymentFrequency: proposal.paymentFrequency,
      hasPendingRenewal: pendingOriginalIds.has(proposal.id),
      daysUntilRenewal: daysUntil(renewalDate),
    });
  }

  candidates.sort(
    (a, b) => a.daysUntilRenewal - b.daysUntilRenewal || a.clientName.localeCompare(b.clientName)
  );
  return candidates;
}

type RenewalServiceInput = {
  name: string;
  description: string | null;
  quantity: number;
  unitPricePence: number;
  discountPercent: number;
  displayPricePence: number | null;
  billingFrequency: string;
  priceDisplayMode: string;
  frequency: string;
  isOptional: boolean;
  serviceTemplateId: string | null;
  vatRate: number;
  oneOffDueDate: Date | null;
};

export function resolveUpliftRules(upliftRules?: UpliftRules, upliftPercent?: number): UpliftRules {
  if (upliftRules) return upliftRules;
  return {
    mode: 'percent',
    percent: upliftPercent ?? 0,
  };
}

/**
 * Per line: max(percent uplift, CPI uplift, service/global minimum floor).
 */
export function computeUpliftedUnitPrice(
  basePrice: number,
  rules: UpliftRules,
  service: { name: string; serviceTemplateId: string | null }
): number {
  const candidates: number[] = [basePrice];

  if (rules.percent != null) {
    candidates.push(Math.round(basePrice * (1 + rules.percent / 100) * 100) / 100);
  }
  if (rules.cpiPercent != null) {
    candidates.push(Math.round(basePrice * (1 + rules.cpiPercent / 100) * 100) / 100);
  }

  const serviceKeys = [service.serviceTemplateId, service.name].filter((k): k is string =>
    Boolean(k)
  );

  let floor: number | undefined;
  if (rules.perServiceFloors) {
    for (const key of serviceKeys) {
      const value = rules.perServiceFloors[key];
      if (value != null) {
        floor = floor == null ? value : Math.max(floor, value);
      }
    }
  }
  if (rules.minFeeGbp != null) {
    floor = floor == null ? rules.minFeeGbp : Math.max(floor, rules.minFeeGbp);
  }
  if (floor != null) {
    candidates.push(floor);
  }

  return Math.max(0, Math.round(Math.max(...candidates) * 100) / 100);
}

function applyUpliftRulesToServices(services: RenewalServiceInput[], rules: UpliftRules) {
  return services.map((svc) => {
    // Uplift math runs in pounds (rules are GBP); pence → pounds is lossless.
    const basePrice = penceToPounds(svc.displayPricePence ?? svc.unitPricePence);
    const displayPrice = computeUpliftedUnitPrice(basePrice, rules, svc);

    return buildProposalServiceRecord(
      {
        serviceId: svc.serviceTemplateId || 'legacy',
        name: svc.name,
        description: svc.description,
        quantity: svc.quantity,
        discountPercent: svc.discountPercent,
        displayPrice,
        billingFrequency: svc.billingFrequency,
        vatRate: svc.vatRate,
        oneOffDueDate: svc.oneOffDueDate?.toISOString().slice(0, 10),
      },
      undefined,
      parseOneOffDueDate
    );
  });
}

function describeUpliftRules(rules: UpliftRules): string {
  const parts: string[] = [];
  if (rules.percent != null && rules.percent !== 0) {
    parts.push(`${rules.percent > 0 ? '+' : ''}${rules.percent}% uplift`);
  }
  if (rules.cpiPercent != null && rules.cpiPercent !== 0) {
    parts.push(`${rules.cpiPercent}% CPI adjustment`);
  }
  if (rules.minFeeGbp != null) {
    parts.push(`£${rules.minFeeGbp} minimum per line`);
  }
  if (rules.perServiceFloors && Object.keys(rules.perServiceFloors).length > 0) {
    parts.push('per-service fee floors');
  }
  if (parts.length === 0) return '';
  return ` Fees adjusted (${parts.join('; ')}; highest value per line applied).`;
}

async function loadProposalTemplate(templateId: string, tenantId: string) {
  const template = await prisma.proposalTemplate.findFirst({
    where: { id: templateId, tenantId, isActive: true },
  });
  if (!template) {
    throw new ApiError('TEMPLATE_NOT_FOUND', 'Proposal template not found', 404);
  }
  let serviceConfig: unknown[] = [];
  try {
    const parsed = JSON.parse(template.serviceConfig || '[]');
    serviceConfig = Array.isArray(parsed) ? parsed : [];
  } catch {
    serviceConfig = [];
  }
  return { template, serviceConfig };
}

/**
 * Create a DRAFT renewal proposal from an accepted original (does not send).
 */
export async function createRenewalDraft(
  tenantId: string,
  userId: string,
  originalProposalId: string,
  options: CreateRenewalDraftOptions = {}
) {
  const originalProposal = await prisma.proposal.findFirst({
    where: {
      id: originalProposalId,
      tenantId,
      status: 'ACCEPTED',
    },
    include: {
      client: true,
      services: true,
    },
  });

  if (!originalProposal) {
    throw new ApiError('NOT_FOUND', 'Accepted proposal not found', 404);
  }

  const existingRenewal = await prisma.proposal.findFirst({
    where: {
      tenantId,
      originalProposalId: originalProposal.id,
      isRenewal: true,
      status: { in: ['DRAFT', 'SENT', 'VIEWED'] },
    },
    select: { id: true, reference: true },
  });

  if (existingRenewal) {
    throw new ApiError(
      'RENEWAL_EXISTS',
      `A renewal draft already exists (${existingRenewal.reference})`,
      409
    );
  }

  const upliftRules = resolveUpliftRules(options.upliftRules, options.upliftPercent);
  const upliftPercent = upliftRules.percent ?? options.upliftPercent ?? 0;
  const tenantRecord = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  const proposalSettings = getProposalSettings(tenantRecord?.settings);
  const validUntil = addDays(new Date(), proposalSettings.defaultExpiryDays);

  const renewalDate = new Date();
  renewalDate.setFullYear(renewalDate.getFullYear() + 1);

  let title = `${originalProposal.title} (Renewal)`;
  let coverLetter = originalProposal.coverLetter;
  let terms = originalProposal.terms;
  const paymentTerms = originalProposal.paymentTerms;
  const paymentFrequency = originalProposal.paymentFrequency;

  if (options.templateId) {
    const { template } = await loadProposalTemplate(options.templateId, tenantId);
    if (template.title)
      title = template.title.replace(/\[Client Name\]/gi, originalProposal.client.name);
    if (template.coverLetter) coverLetter = template.coverLetter;
    if (template.terms) terms = template.terms;
    await prisma.proposalTemplate.update({
      where: { id: template.id },
      data: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
  }

  const builtServices = applyUpliftRulesToServices(originalProposal.services, upliftRules);

  if (options.useAiCoverLetter) {
    try {
      const { generateRenewalDraft } = await import('./ai/proposalAiService.js');
      const aiDraft = await generateRenewalDraft(
        tenantId,
        userId,
        originalProposal.id,
        upliftPercent
      );
      if (aiDraft.coverLetter) coverLetter = aiDraft.coverLetter;
      if (aiDraft.title && !options.templateId) title = aiDraft.title;
    } catch {
      // AI is optional — fall back to copied or template cover letter
    }
  }

  const totals = calculateHeaderTotals(builtServices);
  const reference = generateReference('PROP');

  const renewalProposal = await prisma.proposal.create({
    data: {
      reference,
      title,
      tenantId,
      clientId: originalProposal.clientId,
      createdById: userId,
      status: 'DRAFT',
      validUntil,
      discountType: originalProposal.discountType,
      discountValue: originalProposal.discountValue,
      vatRate: 20,
      subtotalPence: totals.subtotalPence,
      discountAmountPence: originalProposal.discountAmountPence,
      vatAmountPence: totals.vatAmountPence,
      totalPence: totals.totalPence,
      paymentTerms,
      paymentFrequency,
      coverLetter,
      terms,
      notes:
        `Renewal of proposal ${originalProposal.reference}.${describeUpliftRules(upliftRules)} ${originalProposal.notes || ''}`.trim(),
      isRenewal: true,
      originalProposalId: originalProposal.id,
      renewalDate,
      services: {
        create: builtServices.map((svc) => ({
          name: svc.name,
          description: svc.description,
          quantity: svc.quantity,
          unitPricePence: svc.unitPricePence,
          discountPercent: svc.discountPercent,
          displayPricePence: svc.displayPricePence,
          annualEquivalentPence: svc.annualEquivalentPence,
          lineTotalPence: svc.lineTotalPence,
          billingFrequency: svc.billingFrequency,
          priceDisplayMode: svc.priceDisplayMode,
          frequency: svc.frequency,
          vatRate: svc.vatRate,
          vatAmountPence: svc.vatAmountPence,
          grossTotalPence: svc.grossTotalPence,
          oneOffDueDate: svc.oneOffDueDate,
          serviceTemplateId: svc.serviceTemplateId,
        })) as any,
      },
    },
    include: {
      client: true,
      services: true,
      createdBy: {
        select: { firstName: true, lastName: true },
      },
    },
  });

  await prisma.activityLog.create({
    data: {
      tenantId,
      userId,
      action: 'PROPOSAL_RENEWAL_CREATED',
      entityType: 'PROPOSAL',
      entityId: renewalProposal.id,
      description: `Created renewal proposal "${renewalProposal.title}" from ${originalProposal.reference}`,
      metadata: JSON.stringify({
        originalProposalId: originalProposal.id,
        originalReference: originalProposal.reference,
        upliftPercent,
        upliftRules,
        templateId: options.templateId ?? null,
        useAiCoverLetter: options.useAiCoverLetter ?? false,
        bulkRenewal: options.bulkRenewal ?? false,
      }),
    },
  });

  // Archive the superseded accepted proposal — renewal quote replaces it in the
  // pipeline. Clara's agentic drafts defer this until a human approves the
  // renewal (archiveOriginal: false → routes/proposals/approvals.ts).
  if (options.archiveOriginal !== false) {
    await archiveSupersededOriginal(tenantId, userId, originalProposal, renewalProposal);
  }

  return renewalProposal;
}

/**
 * Archive an ACCEPTED proposal superseded by a renewal: revoke any live share
 * link, set ARCHIVED + supersededById, and log PROPOSAL_ARCHIVED_SUPERSEDED.
 * Callers must confirm the original is still ACCEPTED first, which keeps the
 * deferred (approve-time) path idempotent and a no-op for already-archived
 * originals.
 */
export async function archiveSupersededOriginal(
  tenantId: string,
  userId: string | undefined,
  original: {
    id: string;
    reference: string;
    shareToken: string | null;
    publicAccessEnabled: boolean;
  },
  renewal: { id: string; reference: string }
): Promise<void> {
  if (original.shareToken || original.publicAccessEnabled) {
    try {
      await revokeShareableLink(original.id);
    } catch {
      // non-fatal
    }
  }

  await prisma.proposal.update({
    where: { id: original.id },
    data: {
      status: 'ARCHIVED',
      supersededById: renewal.id,
      archivedAt: new Date(),
      publicAccessEnabled: false,
      shareToken: null,
      shareTokenExpiry: null,
    },
  });

  await prisma.activityLog.create({
    data: {
      tenantId,
      userId,
      action: 'PROPOSAL_ARCHIVED_SUPERSEDED',
      entityType: 'PROPOSAL',
      entityId: original.id,
      description: `Archived ${original.reference} — superseded by renewal ${renewal.reference}`,
      metadata: JSON.stringify({
        supersededById: renewal.id,
        supersededByReference: renewal.reference,
      }),
    },
  });
}

export interface BulkRenewalRequest {
  tenantId: string;
  userId: string;
  clientIds?: string[];
  proposalIds?: string[];
  expiringBefore?: Date;
  templateId?: string;
  upliftPercent?: number;
  upliftRules?: UpliftRules;
  useAiCoverLetter?: boolean;
}

/**
 * Batch-create DRAFT renewal proposals (never auto-sends).
 */
export async function bulkCreateRenewalDrafts(
  request: BulkRenewalRequest
): Promise<BulkRenewalResult> {
  const {
    tenantId,
    userId,
    clientIds,
    proposalIds,
    templateId,
    upliftPercent = 0,
    upliftRules,
    useAiCoverLetter = false,
  } = request;

  const resolvedUpliftRules = resolveUpliftRules(upliftRules, upliftPercent);

  let targets: RenewalCandidate[] = [];

  if (proposalIds?.length) {
    const pendingOriginalIds = await pendingRenewalProposalIds(tenantId);
    const proposals = await prisma.proposal.findMany({
      where: {
        tenantId,
        id: { in: proposalIds },
        status: 'ACCEPTED',
        isRenewal: false,
      },
      include: {
        client: { select: { id: true, name: true, companyType: true } },
      },
    });

    const byId = new Map(proposals.map((p) => [p.id, p]));
    targets = proposalIds
      .map((id) => {
        const proposal = byId.get(id);
        if (!proposal) return null;
        const renewalDate = effectiveRenewalDate(proposal);
        if (!renewalDate) return null;
        const candidate: RenewalCandidate = {
          clientId: proposal.clientId,
          clientName: proposal.client.name,
          companyType: proposal.client.companyType,
          proposalId: proposal.id,
          proposalReference: proposal.reference,
          proposalTitle: proposal.title,
          renewalDate: renewalDate.toISOString(),
          total: penceToPounds(proposal.totalPence),
          paymentFrequency: proposal.paymentFrequency,
          hasPendingRenewal: pendingOriginalIds.has(proposal.id),
          daysUntilRenewal: daysUntil(renewalDate),
        };
        return candidate;
      })
      .filter((c): c is RenewalCandidate => c !== null);
  } else if (clientIds?.length) {
    targets = await findRenewalCandidates({
      tenantId,
      clientIds,
      expiringBefore: request.expiringBefore ?? addDays(new Date(), 365 * 5),
    });
    const clientSet = new Set(clientIds);
    targets = targets.filter((t) => clientSet.has(t.clientId));
  } else if (request.expiringBefore) {
    targets = await findRenewalCandidates({
      tenantId,
      expiringBefore: request.expiringBefore,
    });
  } else {
    throw new ApiError(
      'INVALID_REQUEST',
      'Provide clientIds, proposalIds, or an expiringBefore filter',
      400
    );
  }

  const result: BulkRenewalResult = {
    created: [],
    skipped: [],
    failed: [],
    summary: { requested: targets.length, created: 0, skipped: 0, failed: 0 },
  };

  for (const target of targets) {
    if (target.hasPendingRenewal) {
      result.skipped.push({
        clientId: target.clientId,
        clientName: target.clientName,
        reason: 'A renewal draft already exists for this contract',
      });
      result.summary.skipped++;
      continue;
    }

    try {
      const created = await createRenewalDraft(tenantId, userId, target.proposalId, {
        templateId,
        upliftPercent: resolvedUpliftRules.percent ?? upliftPercent,
        upliftRules: resolvedUpliftRules,
        useAiCoverLetter,
        bulkRenewal: true,
      });

      result.created.push({
        clientId: target.clientId,
        clientName: target.clientName,
        proposalId: created.id,
        reference: created.reference,
        title: created.title,
        total: penceToPounds(created.totalPence),
      });
      result.summary.created++;
    } catch (err: any) {
      if (err instanceof ApiError && err.code === 'RENEWAL_EXISTS') {
        result.skipped.push({
          clientId: target.clientId,
          clientName: target.clientName,
          reason: err.message,
        });
        result.summary.skipped++;
      } else {
        result.failed.push({
          clientId: target.clientId,
          clientName: target.clientName,
          reason: err?.message || 'Failed to create renewal draft',
        });
        result.summary.failed++;
      }
    }
  }

  return result;
}

export function parseExpiringBeforeInput(raw: unknown): Date {
  const parsed = parseProposalDateInput(raw);
  if (!parsed) {
    throw new ApiError('INVALID_DATE', 'expiringBefore must be a valid date (YYYY-MM-DD)', 400);
  }
  const endOfDay = new Date(parsed);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay;
}
