/**
 * LOE-only proposal path — engagement letter without service pricing.
 */
import { prisma } from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import {
  assembleEngagementLetterFromClauses,
  selectClausesForServices,
} from '../data/engagementClauseLibrary.js';
import { regulatoryBodyLabel } from '../utils/professionalBodyClauses.js';
import { serializeProposalCustomFields } from '../utils/proposalCustomFields.js';
import { buildProposalServiceRecord } from '../utils/proposalPricing.js';
import {
  addDays,
  formatPaymentTerms,
  getProposalSettings,
  parseProposalDateInput,
} from '../utils/tenantProposalSettings.js';
import { resolveProposalTerms } from './proposalTermsService.js';

const LOE_FEES_SUMMARY =
  'Fees will be agreed separately in writing. This letter of engagement confirms scope and terms only — no fee schedule is attached.';

function parseOneOffDueDate(): null {
  return null;
}

function generateReference(prefix = 'LOE'): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

function parseTenantSettings(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return raw as Record<string, unknown>;
}

export interface CreateLoeOnlyProposalInput {
  tenantId: string;
  userId: string;
  clientId: string;
  serviceIds: string[];
  title?: string;
  validUntil?: string;
  contractStartDate?: string | null;
  notes?: string;
}

export async function createLoeOnlyProposal(input: CreateLoeOnlyProposalInput) {
  if (!input.serviceIds.length) {
    throw new ApiError('VALIDATION_ERROR', 'Select at least one service for scope clauses', 400);
  }

  const client = await prisma.client.findFirst({
    where: { id: input.clientId, tenantId: input.tenantId },
  });
  if (!client) {
    throw new ApiError('CLIENT_NOT_FOUND', 'Client not found', 404);
  }

  const [tenant, serviceTemplates] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { name: true, settings: true },
    }),
    prisma.serviceTemplate.findMany({
      where: { id: { in: input.serviceIds }, tenantId: input.tenantId, isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        tags: true,
        priceAmount: true,
        basePrice: true,
        billingCycle: true,
      },
    }),
  ]);

  if (serviceTemplates.length !== input.serviceIds.length) {
    throw new ApiError(
      'INVALID_SERVICES',
      'One or more services are invalid or belong to another practice',
      400
    );
  }

  const settings = parseTenantSettings(tenant?.settings);
  const proposalSettings = getProposalSettings(tenant?.settings);
  const professionalBody = regulatoryBodyLabel(
    typeof settings.professionalBody === 'string' ? settings.professionalBody : undefined
  );
  const practiceName = tenant?.name || 'Your practice';

  const serviceRows = serviceTemplates.map((t) => ({
    name: t.name,
    tags: t.tags || undefined,
  }));

  const clauses = selectClausesForServices(serviceRows, { professionalBody });

  const parsedValidUntil = input.validUntil ? parseProposalDateInput(input.validUntil) : null;
  const validUntil =
    parsedValidUntil && parsedValidUntil !== null
      ? parsedValidUntil
      : addDays(new Date(), proposalSettings.defaultExpiryDays);

  const contractStartDate =
    input.contractStartDate !== undefined
      ? parseProposalDateInput(input.contractStartDate)
      : null;

  const periodStart = contractStartDate
    ? contractStartDate.toISOString().slice(0, 10)
    : 'On acceptance';
  const periodEnd = addDays(contractStartDate || new Date(), 365).toISOString().slice(0, 10);

  const engagementLetter = assembleEngagementLetterFromClauses(
    practiceName,
    client.name,
    clauses,
    LOE_FEES_SUMMARY,
    `${periodStart} to ${periodEnd}`
  );

  const terms = await resolveProposalTerms(input.tenantId, serviceRows);
  const title =
    input.title?.trim() ||
    `Letter of engagement — ${client.name}`;

  const builtServices = input.serviceIds.map((serviceId) => {
    const template = serviceTemplates.find((t) => t.id === serviceId);
    const line = buildProposalServiceRecord(
      {
        serviceId,
        name: template?.name,
        displayPrice: 0,
        quantity: 1,
        billingFrequency: 'ANNUALLY',
        vatRate: 0,
      },
      template,
      parseOneOffDueDate
    );
    return { ...line, serviceTemplateId: serviceId };
  });

  const reference = generateReference();

  const proposal = await prisma.proposal.create({
    data: {
      reference,
      title,
      tenantId: input.tenantId,
      clientId: input.clientId,
      createdById: input.userId,
      status: 'DRAFT',
      validUntil,
      contractStartDate,
      subtotal: 0,
      discountAmount: 0,
      vatAmount: 0,
      total: 0,
      paymentTerms: formatPaymentTerms(proposalSettings.defaultPaymentTermsDays),
      paymentFrequency: 'ANNUALLY',
      engagementLetter,
      terms,
      notes: input.notes,
      customFields: serializeProposalCustomFields({ proposalType: 'loe_only' }),
      services: {
        create: builtServices as any,
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
      tenantId: input.tenantId,
      userId: input.userId,
      action: 'PROPOSAL_CREATED',
      entityType: 'PROPOSAL',
      entityId: proposal.id,
      description: `Created LOE-only engagement letter "${proposal.title}"`,
      metadata: JSON.stringify({
        proposalType: 'loe_only',
        clauseIds: clauses.map((c) => c.id),
        serviceCount: serviceTemplates.length,
      }),
    },
  });

  return {
    proposal,
    clauseIds: clauses.map((c) => c.id),
  };
}