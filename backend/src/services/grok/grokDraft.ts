import { prisma } from '../../config/database.js';
import { resolveCatalogBillingCycle } from '@uk-proposal-platform/shared';
import {
  buildProposalServiceRecord,
  calculateHeaderTotals,
  penceToPounds,
  type BuiltProposalService,
  type ServiceTemplateInfo,
} from '../../utils/proposalPricing.js';
import {
  addDays,
  formatPaymentTerms,
  getProposalSettings,
} from '../../utils/tenantProposalSettings.js';
import { generateReference, parseOneOffDueDate } from '../../routes/proposals/shared.js';
import { resolveProposalTerms } from '../proposalTermsService.js';
import { writeGrokAudit, type GrokActor } from './grokAudit.js';

const FREQUENCIES = ['ONE_TIME', 'HOURLY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY'] as const;
type Frequency = (typeof FREQUENCIES)[number];

const PROPOSAL_INCLUDE = {
  client: {
    select: {
      id: true,
      name: true,
      contactName: true,
      contactEmail: true,
      companyType: true,
      companyNumber: true,
    },
  },
  services: { orderBy: { sortOrder: 'asc' as const } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
};

export function draftOnlyMessage(status: string): string {
  return `This proposal is ${status}. The assistant can only change a draft. Caroline sends it from Engage herself.`;
}

function gbp(pence: number | null | undefined): number {
  return Number(penceToPounds(pence).toFixed(2));
}

function money(pounds: number): string {
  return `£${pounds.toFixed(2)}`;
}

function cadence(frequency: string, mode: string | null | undefined): string {
  switch (frequency) {
    case 'MONTHLY':
      return 'a month';
    case 'QUARTERLY':
      return 'a quarter';
    case 'ANNUALLY':
      return 'a year';
    case 'WEEKLY':
      return 'a week';
    case 'ONE_TIME':
      return 'as a one-off';
    case 'HOURLY':
      return mode === 'MONTHLY_ACTUAL' ? 'an hour, estimated each month' : 'an hour, quoted once';
    default:
      return frequency.toLowerCase();
  }
}

export function vatPercentForTemplate(template: {
  vatRate?: string | null;
  isVatApplicable?: boolean | null;
}): number {
  if (template.isVatApplicable === false) return 0;
  if (template.vatRate === 'REDUCED_5') return 5;
  if (template.vatRate === 'ZERO' || template.vatRate === 'EXEMPT') return 0;
  return 20;
}

function str(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

function rejectUnknown(args: Record<string, unknown>, allowed: string[]): void {
  for (const key of Object.keys(args)) {
    if (!allowed.includes(key)) {
      throw new Error(
        `Unexpected field "${key}". This assistant cannot change that. Caroline sends and signs proposals in Engage.`
      );
    }
  }
}

function frequencyOrThrow(raw: unknown): Frequency | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = String(raw).trim().toUpperCase();
  if (value === 'ONE_OFF') return 'ONE_TIME';
  if (!FREQUENCIES.includes(value as Frequency)) {
    throw new Error(`Billing frequency must be one of ${FREQUENCIES.join(', ')}.`);
  }
  return value as Frequency;
}

function hourlyModeOrThrow(raw: unknown): 'ONE_OFF' | 'MONTHLY_ACTUAL' | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = String(raw).trim().toUpperCase();
  if (value !== 'ONE_OFF' && value !== 'MONTHLY_ACTUAL') {
    throw new Error('Hourly billing mode must be ONE_OFF or MONTHLY_ACTUAL.');
  }
  return value;
}

function poundsOrThrow(raw: unknown, label: string): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
    throw new Error(`${label} must be a number from 0 to 1000000 pounds.`);
  }
  return Math.round(n * 100) / 100;
}

function quantityOrThrow(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 10_000) {
    throw new Error(
      'Quantity must be a number from 1 to 10000. On hourly work, quantity is the hours.'
    );
  }
  return n;
}

function notesOrThrow(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('Notes must be text.');
  if (raw.length > 5000) throw new Error('Notes must be 5000 characters or fewer.');
  return raw;
}

function descriptionOrThrow(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== 'string') throw new Error('The line note must be text.');
  if (raw.length > 2000) throw new Error('The line note must be 2000 characters or fewer.');
  return raw;
}

export function presentProposal(proposal: {
  id: string;
  reference: string;
  title: string;
  status: string;
  approvalStatus: string;
  notes: string | null;
  coverLetter: string | null;
  proposalSummary: string | null;
  terms: string | null;
  paymentTerms: string;
  paymentFrequency: string;
  validUntil: Date;
  contractStartDate: Date | null;
  subtotalPence: number;
  vatAmountPence: number;
  totalPence: number;
  createdAt: Date;
  updatedAt: Date;
  client: {
    id: string;
    name: string;
    contactName: string | null;
    contactEmail: string;
    companyType: string;
    companyNumber: string | null;
  };
  services: Array<{
    id: string;
    serviceTemplateId: string | null;
    name: string;
    description: string | null;
    billingFrequency: string;
    hourlyBillingMode: string | null;
    quantity: number;
    discountPercent: number;
    vatRate: number;
    displayPricePence: number;
    lineTotalPence: number;
    vatAmountPence: number;
    grossTotalPence: number;
    annualEquivalentPence: number;
    sortOrder: number;
  }>;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
}) {
  return {
    id: proposal.id,
    reference: proposal.reference,
    title: proposal.title,
    status: proposal.status,
    approval_status: proposal.approvalStatus,
    editable: proposal.status === 'DRAFT',
    notes: proposal.notes,
    cover_letter: proposal.coverLetter,
    proposal_summary: proposal.proposalSummary,
    terms: proposal.terms,
    payment_terms: proposal.paymentTerms,
    payment_frequency: proposal.paymentFrequency,
    valid_until: proposal.validUntil,
    contract_start_date: proposal.contractStartDate,
    client: {
      id: proposal.client.id,
      name: proposal.client.name,
      contact_name: proposal.client.contactName,
      contact_email: proposal.client.contactEmail,
      company_type: proposal.client.companyType,
      company_number: proposal.client.companyNumber,
    },
    totals: {
      net_gbp: gbp(proposal.subtotalPence),
      vat_gbp: gbp(proposal.vatAmountPence),
      gross_gbp: gbp(proposal.totalPence),
    },
    totals_note:
      'The gross total adds each line as stored. It does not turn monthly, annual, hourly and one-off lines into one monthly fee.',
    services: proposal.services.map((s) => ({
      id: s.id,
      service_id: s.serviceTemplateId,
      name: s.name,
      description: s.description,
      billing_frequency: s.billingFrequency,
      hourly_billing_mode: s.hourlyBillingMode,
      quantity: s.quantity,
      discount_percent: s.discountPercent,
      vat_rate: s.vatRate,
      display_price_gbp: gbp(s.displayPricePence),
      line_net_gbp: gbp(s.lineTotalPence),
      vat_gbp: gbp(s.vatAmountPence),
      gross_gbp: gbp(s.grossTotalPence),
      unit_annual_equivalent_gbp: gbp(s.annualEquivalentPence),
      sort_order: s.sortOrder,
    })),
    created_by: proposal.createdBy
      ? {
          id: proposal.createdBy.id,
          name: `${proposal.createdBy.firstName} ${proposal.createdBy.lastName}`.trim(),
        }
      : null,
    created_at: proposal.createdAt,
    updated_at: proposal.updatedAt,
  };
}

async function loadProposal(tenantId: string, id: string) {
  const proposal = await prisma.proposal.findFirst({
    where: { id, tenantId },
    include: PROPOSAL_INCLUDE,
  });
  if (!proposal) throw new Error('Proposal not found in this practice.');
  return proposal;
}

function assertDraft(proposal: { status: string }): void {
  if (proposal.status !== 'DRAFT') {
    throw new Error(draftOnlyMessage(proposal.status));
  }
}

function templateInfo(row: {
  id: string;
  name: string;
  description: string | null;
  priceAmount: number | null;
  basePrice: number | null;
  billingCycle: string | null;
  defaultFrequency: string | null;
  priceDisplayMode: string | null;
  frequencyOptions: string | null;
}): ServiceTemplateInfo {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    priceAmount: row.priceAmount,
    basePrice: row.basePrice,
    billingCycle: resolveCatalogBillingCycle(row),
    defaultFrequency: row.defaultFrequency,
  };
}

type LinePatch = {
  displayPriceGbp?: number;
  billingFrequency?: Frequency;
  quantity?: number;
  hourlyBillingMode?: 'ONE_OFF' | 'MONTHLY_ACTUAL';
  description?: string | null;
};

function buildLineRecord(
  input: LinePatch & { description?: string | null },
  template: ServiceTemplateInfo | undefined,
  vatRate: number,
  extras: { name?: string; discountPercent?: number; oneOffDueDate?: string | null }
): BuiltProposalService {
  const billingFrequency = input.billingFrequency;
  if (input.hourlyBillingMode && billingFrequency && billingFrequency !== 'HOURLY') {
    throw new Error('Hourly billing mode is only for HOURLY lines.');
  }
  return buildProposalServiceRecord(
    {
      serviceId: template?.id || 'line',
      name: extras.name,
      description: input.description,
      quantity: input.quantity ?? 1,
      discountPercent: extras.discountPercent ?? 0,
      displayPrice: input.displayPriceGbp,
      billingFrequency,
      vatRate,
      hourlyBillingMode:
        billingFrequency === 'HOURLY' ? input.hourlyBillingMode : input.hourlyBillingMode,
      oneOffDueDate: extras.oneOffDueDate,
    },
    template,
    parseOneOffDueDate
  );
}

export async function createDraftProposal(ctx: GrokActor, args: Record<string, unknown>) {
  rejectUnknown(args, ['client_id', 'title', 'notes', 'lines']);
  const clientId = str(args.client_id);
  if (!clientId) throw new Error('client_id is required.');
  const notes = args.notes === undefined ? null : notesOrThrow(args.notes);
  const rawLines = args.lines;
  if (!Array.isArray(rawLines) || rawLines.length < 1) {
    throw new Error('A draft needs at least one service. Call list_services, then pass lines.');
  }
  if (rawLines.length > 30) throw new Error('A draft can have at most 30 lines.');

  const parsedLines = rawLines.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`Line ${index + 1} must be an object.`);
    }
    const line = raw as Record<string, unknown>;
    rejectUnknown(line, [
      'service_id',
      'display_price_gbp',
      'billing_frequency',
      'quantity',
      'hourly_billing_mode',
      'description',
    ]);
    const serviceId = str(line.service_id);
    if (!serviceId) throw new Error(`Line ${index + 1} needs service_id.`);
    const billingFrequency = frequencyOrThrow(line.billing_frequency);
    const hourlyBillingMode = hourlyModeOrThrow(line.hourly_billing_mode);
    if (hourlyBillingMode && billingFrequency && billingFrequency !== 'HOURLY') {
      throw new Error('Hourly billing mode is only for HOURLY lines.');
    }
    return {
      serviceId,
      displayPriceGbp: poundsOrThrow(line.display_price_gbp, 'Fee'),
      billingFrequency,
      quantity: quantityOrThrow(line.quantity),
      hourlyBillingMode,
      description: descriptionOrThrow(line.description),
    };
  });

  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId: ctx.tenantId },
  });
  if (!client) throw new Error('Client not found in this practice.');

  const requestedIds = [...new Set(parsedLines.map((l) => l.serviceId))];
  const templates = await prisma.serviceTemplate.findMany({
    where: { id: { in: requestedIds }, tenantId: ctx.tenantId },
  });
  if (templates.length !== requestedIds.length) {
    throw new Error('One or more services are not in this practice catalogue.');
  }
  const inactive = templates.find((t) => !t.isActive);
  if (inactive) throw new Error(`"${inactive.name}" is not an active catalogue service.`);
  const byId = new Map(templates.map((t) => [t.id, t]));

  const built = parsedLines.map((line, index) => {
    const template = byId.get(line.serviceId)!;
    const info = templateInfo(template);
    const frequency = line.billingFrequency || (info.billingCycle as Frequency);
    if (line.hourlyBillingMode && frequency !== 'HOURLY') {
      throw new Error('Hourly billing mode is only for HOURLY lines.');
    }
    const record = buildLineRecord(
      { ...line, billingFrequency: frequency },
      info,
      vatPercentForTemplate(template),
      {}
    );
    return { ...record, sortOrder: index };
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { settings: true },
  });
  const proposalSettings = getProposalSettings(tenant?.settings);
  const totals = calculateHeaderTotals(built);
  const reference = generateReference('PROP');
  const titleInput = str(args.title);
  if (args.title !== undefined && !titleInput) throw new Error('Title cannot be empty.');
  if (titleInput.length > 200) throw new Error('Title must be 200 characters or fewer.');
  const title = titleInput || `Proposal for ${client.name}`.slice(0, 200);
  const terms = await resolveProposalTerms(
    ctx.tenantId,
    templates.map((t) => ({ name: t.name, tags: t.tags }))
  );

  const created = await prisma.$transaction(async (tx) => {
    const proposal = await tx.proposal.create({
      data: {
        reference,
        title,
        tenantId: ctx.tenantId,
        clientId: client.id,
        createdById: ctx.userId,
        status: 'DRAFT',
        validUntil: addDays(new Date(), proposalSettings.defaultExpiryDays),
        vatRate: 20,
        subtotalPence: totals.subtotalPence,
        discountAmountPence: 0,
        vatAmountPence: totals.vatAmountPence,
        totalPence: totals.totalPence,
        paymentTerms: formatPaymentTerms(proposalSettings.defaultPaymentTermsDays),
        paymentFrequency: 'MONTHLY',
        terms,
        notes,
        services: { create: built as any },
      },
      select: { id: true, reference: true },
    });
    await writeGrokAudit(tx, {
      ctx,
      proposalId: proposal.id,
      tool: 'engage_create_draft_proposal',
      summary: `Created draft ${proposal.reference} for ${client.name}.`,
      changes: {
        reference: proposal.reference,
        client_id: client.id,
        title,
        line_count: built.length,
        total_pence: totals.totalPence,
      },
    });
    return proposal;
  });

  return presentProposal(await loadProposal(ctx.tenantId, created.id));
}

async function requireDraft(ctx: GrokActor, proposalId: string) {
  if (!proposalId) throw new Error('proposal_id is required.');
  const proposal = await loadProposal(ctx.tenantId, proposalId);
  assertDraft(proposal);
  return proposal;
}

export async function addDraftLine(ctx: GrokActor, args: Record<string, unknown>) {
  rejectUnknown(args, [
    'proposal_id',
    'service_id',
    'display_price_gbp',
    'billing_frequency',
    'quantity',
    'hourly_billing_mode',
    'description',
  ]);
  const proposal = await requireDraft(ctx, str(args.proposal_id));
  if (proposal.services.length >= 30) throw new Error('A draft can have at most 30 lines.');
  const serviceId = str(args.service_id);
  if (!serviceId) throw new Error('service_id is required.');
  const billingFrequency = frequencyOrThrow(args.billing_frequency);
  const hourlyBillingMode = hourlyModeOrThrow(args.hourly_billing_mode);
  const template = await prisma.serviceTemplate.findFirst({
    where: { id: serviceId, tenantId: ctx.tenantId },
  });
  if (!template) throw new Error('That service is not in this practice catalogue.');
  if (!template.isActive) throw new Error(`"${template.name}" is not an active catalogue service.`);
  const info = templateInfo(template);
  const frequency = billingFrequency || (info.billingCycle as Frequency);
  if (hourlyBillingMode && frequency !== 'HOURLY') {
    throw new Error('Hourly billing mode is only for HOURLY lines.');
  }
  const record = buildLineRecord(
    {
      displayPriceGbp: poundsOrThrow(args.display_price_gbp, 'Fee'),
      billingFrequency: frequency,
      quantity: quantityOrThrow(args.quantity),
      hourlyBillingMode,
      description: descriptionOrThrow(args.description),
    },
    info,
    vatPercentForTemplate(template),
    {}
  );
  const sortOrder = proposal.services.reduce((max, s) => Math.max(max, s.sortOrder), -1) + 1;
  const totals = calculateHeaderTotals([...proposal.services.map(storedAsBuilt), record]);

  await prisma.$transaction(async (tx) => {
    const line = await tx.proposalService.create({
      data: { ...record, sortOrder, proposalId: proposal.id } as any,
      select: { id: true },
    });
    await tx.proposal.update({
      where: { id: proposal.id },
      data: {
        subtotalPence: totals.subtotalPence,
        vatAmountPence: totals.vatAmountPence,
        totalPence: totals.totalPence,
        discountAmountPence: 0,
      },
    });
    await writeGrokAudit(tx, {
      ctx,
      proposalId: proposal.id,
      tool: 'engage_add_draft_line',
      summary: `Added ${record.name} at ${money(penceToPounds(record.displayPricePence))} ${cadence(record.billingFrequency, record.hourlyBillingMode)}.`,
      changes: {
        line_id: line.id,
        service_id: template.id,
        display_price_gbp: penceToPounds(record.displayPricePence),
        billing_frequency: record.billingFrequency,
        hourly_billing_mode: record.hourlyBillingMode,
        quantity: record.quantity,
        line_net_pence: record.lineTotalPence,
        vat_pence: record.vatAmountPence,
        gross_pence: record.grossTotalPence,
      },
    });
  });

  return presentProposal(await loadProposal(ctx.tenantId, proposal.id));
}

function storedAsBuilt(line: {
  name: string;
  description: string | null;
  billingFrequency: string;
  priceDisplayMode: string;
  quantity: number;
  discountPercent: number;
  frequency: string;
  vatRate: number;
  displayPricePence: number;
  unitPricePence: number;
  annualEquivalentPence: number;
  lineTotalPence: number;
  vatAmountPence: number;
  grossTotalPence: number;
  oneOffDueDate: Date | null;
  hourlyBillingMode: 'ONE_OFF' | 'MONTHLY_ACTUAL' | null;
  serviceTemplateId: string | null;
}): BuiltProposalService {
  return {
    name: line.name,
    description: line.description,
    billingFrequency: line.billingFrequency,
    priceDisplayMode: line.priceDisplayMode,
    quantity: line.quantity,
    discountPercent: line.discountPercent,
    frequency: line.frequency,
    vatRate: line.vatRate,
    displayPricePence: line.displayPricePence,
    unitPricePence: line.unitPricePence,
    annualEquivalentPence: line.annualEquivalentPence,
    lineTotalPence: line.lineTotalPence,
    vatAmountPence: line.vatAmountPence,
    grossTotalPence: line.grossTotalPence,
    oneOffDueDate: line.oneOffDueDate,
    hourlyBillingMode: line.hourlyBillingMode,
    serviceTemplateId: line.serviceTemplateId,
  };
}

export async function updateDraftLine(ctx: GrokActor, args: Record<string, unknown>) {
  rejectUnknown(args, [
    'proposal_id',
    'line_id',
    'display_price_gbp',
    'billing_frequency',
    'quantity',
    'hourly_billing_mode',
    'description',
    'notes',
  ]);
  const proposal = await requireDraft(ctx, str(args.proposal_id));
  const lineId = str(args.line_id);
  if (!lineId) throw new Error('line_id is required.');
  const line = proposal.services.find((s) => s.id === lineId);
  if (!line) throw new Error('That line is not on this draft.');

  const displayPriceGbp = poundsOrThrow(args.display_price_gbp, 'Fee');
  const billingFrequency = frequencyOrThrow(args.billing_frequency);
  const quantity = quantityOrThrow(args.quantity);
  const hourlyBillingMode = hourlyModeOrThrow(args.hourly_billing_mode);
  const description =
    args.notes !== undefined
      ? descriptionOrThrow(args.notes)
      : descriptionOrThrow(args.description);
  if (
    displayPriceGbp === undefined &&
    billingFrequency === undefined &&
    quantity === undefined &&
    hourlyBillingMode === undefined &&
    description === undefined
  ) {
    throw new Error(
      'Say what to change: fee, billing frequency, quantity, hourly mode, or the line note.'
    );
  }

  const nextFrequency = (billingFrequency || line.billingFrequency) as Frequency;
  if (hourlyBillingMode && nextFrequency !== 'HOURLY') {
    throw new Error('Hourly billing mode is only for HOURLY lines.');
  }
  const template: ServiceTemplateInfo | undefined = line.serviceTemplateId
    ? { id: line.serviceTemplateId, name: line.name, description: line.description }
    : undefined;
  const record = buildLineRecord(
    {
      displayPriceGbp: displayPriceGbp ?? penceToPounds(line.displayPricePence),
      billingFrequency: nextFrequency,
      quantity: quantity ?? line.quantity,
      hourlyBillingMode:
        nextFrequency === 'HOURLY'
          ? hourlyBillingMode || line.hourlyBillingMode || 'ONE_OFF'
          : undefined,
      description: description === undefined ? line.description : description,
    },
    template,
    line.vatRate,
    {
      name: line.name,
      discountPercent: line.discountPercent,
      oneOffDueDate: line.oneOffDueDate ? line.oneOffDueDate.toISOString() : null,
    }
  );

  const nextBuilt = proposal.services.map((s) => (s.id === line.id ? record : storedAsBuilt(s)));
  const totals = calculateHeaderTotals(nextBuilt);
  const before = {
    display_price_gbp: penceToPounds(line.displayPricePence),
    billing_frequency: line.billingFrequency,
    hourly_billing_mode: line.hourlyBillingMode,
    quantity: line.quantity,
    description: line.description,
  };
  const after = {
    display_price_gbp: penceToPounds(record.displayPricePence),
    billing_frequency: record.billingFrequency,
    hourly_billing_mode: record.hourlyBillingMode,
    quantity: record.quantity,
    description: record.description,
  };

  await prisma.$transaction(async (tx) => {
    await tx.proposalService.update({
      where: { id: line.id },
      data: record as any,
    });
    await tx.proposal.update({
      where: { id: proposal.id },
      data: {
        subtotalPence: totals.subtotalPence,
        vatAmountPence: totals.vatAmountPence,
        totalPence: totals.totalPence,
        discountAmountPence: 0,
      },
    });
    await writeGrokAudit(tx, {
      ctx,
      proposalId: proposal.id,
      tool: 'engage_update_draft_line',
      summary: `Changed ${line.name} from ${money(before.display_price_gbp)} ${cadence(before.billing_frequency, before.hourly_billing_mode)} to ${money(after.display_price_gbp)} ${cadence(after.billing_frequency, after.hourly_billing_mode)}.`,
      changes: { line_id: line.id, before, after, total_pence: totals.totalPence },
    });
  });

  return presentProposal(await loadProposal(ctx.tenantId, proposal.id));
}

export async function removeDraftLine(ctx: GrokActor, args: Record<string, unknown>) {
  rejectUnknown(args, ['proposal_id', 'line_id']);
  const proposal = await requireDraft(ctx, str(args.proposal_id));
  const lineId = str(args.line_id);
  if (!lineId) throw new Error('line_id is required.');
  const line = proposal.services.find((s) => s.id === lineId);
  if (!line) throw new Error('That line is not on this draft.');
  const remaining = proposal.services.filter((s) => s.id !== line.id).map(storedAsBuilt);
  const totals = calculateHeaderTotals(remaining);

  await prisma.$transaction(async (tx) => {
    await tx.proposalService.delete({ where: { id: line.id } });
    await tx.proposal.update({
      where: { id: proposal.id },
      data: {
        subtotalPence: totals.subtotalPence,
        vatAmountPence: totals.vatAmountPence,
        totalPence: totals.totalPence,
        discountAmountPence: 0,
      },
    });
    await writeGrokAudit(tx, {
      ctx,
      proposalId: proposal.id,
      tool: 'engage_remove_draft_line',
      summary: `Removed ${line.name} from draft ${proposal.reference}.`,
      changes: {
        line_id: line.id,
        name: line.name,
        display_price_gbp: penceToPounds(line.displayPricePence),
        billing_frequency: line.billingFrequency,
        remaining_lines: remaining.length,
      },
    });
  });

  const fresh = await loadProposal(ctx.tenantId, proposal.id);
  return {
    ...presentProposal(fresh),
    note:
      fresh.services.length === 0
        ? 'This draft has no services. Add one before it can be sent from Engage.'
        : undefined,
  };
}

export async function updateDraftNotes(ctx: GrokActor, args: Record<string, unknown>) {
  rejectUnknown(args, ['proposal_id', 'notes']);
  const proposal = await requireDraft(ctx, str(args.proposal_id));
  if (args.notes === undefined)
    throw new Error('notes is required. Pass an empty string to clear them.');
  const notes = notesOrThrow(args.notes);
  await prisma.$transaction(async (tx) => {
    await tx.proposal.update({
      where: { id: proposal.id },
      data: { notes },
    });
    await writeGrokAudit(tx, {
      ctx,
      proposalId: proposal.id,
      tool: 'engage_update_draft_notes',
      summary: `Updated the notes on draft ${proposal.reference}.`,
      changes: { before: proposal.notes, after: notes },
    });
  });
  return presentProposal(await loadProposal(ctx.tenantId, proposal.id));
}
