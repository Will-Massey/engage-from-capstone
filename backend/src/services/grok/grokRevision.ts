import { prisma } from '../../config/database.js';
import { generateReference } from '../../routes/proposals/shared.js';
import { lockProposalRow } from '../proposals/proposalWriteGuard.js';
import { writeGrokAudit, type GrokActor } from './grokAudit.js';
import { presentProposal } from './grokDraft.js';

type SourceLine = {
  serviceTemplateId: string | null;
  name: string;
  description: string | null;
  billingFrequency: string;
  priceDisplayMode: string;
  quantity: number;
  discountPercent: number;
  vatRate: number;
  displayPricePence: number;
  unitPricePence: number;
  annualEquivalentPence: number;
  lineTotalPence: number;
  vatAmountPence: number;
  grossTotalPence: number;
  frequency: string;
  isOptional: boolean;
  sortOrder: number;
  oneOffDueDate: Date | null;
  hourlyBillingMode: string | null;
};

export type RevisionSource = {
  id: string;
  tenantId: string;
  clientId: string;
  title: string;
  validUntil: Date;
  contractStartDate: Date | null;
  discountType: string | null;
  discountValue: number;
  vatRate: number;
  subtotalPence: number;
  discountAmountPence: number;
  vatAmountPence: number;
  totalPence: number;
  paymentTerms: string;
  paymentFrequency: string;
  coverLetter: string | null;
  proposalSummary: string | null;
  terms: string | null;
  notes: string | null;
  customFields: string;
  engagementLetter: string | null;
  services: SourceLine[];
};

const LINE_COPY_KEYS = [
  'serviceTemplateId',
  'name',
  'description',
  'billingFrequency',
  'priceDisplayMode',
  'quantity',
  'discountPercent',
  'vatRate',
  'displayPricePence',
  'unitPricePence',
  'annualEquivalentPence',
  'lineTotalPence',
  'vatAmountPence',
  'grossTotalPence',
  'frequency',
  'isOptional',
  'sortOrder',
  'oneOffDueDate',
  'hourlyBillingMode',
] as const;

/** Fields a revision must not carry over from a signed or paid original. */
export const REVISION_OMITTED_FIELDS = [
  'status',
  'signature',
  'shareToken',
  'shareTokenExpiry',
  'publicAccessEnabled',
  'acceptedAt',
  'acceptedBy',
  'acceptedByIp',
  'signatoryPosition',
  'termsAccepted',
  'termsAcceptedAt',
  'acceptanceNotifiedAt',
  'paidAt',
  'paymentId',
  'paymentStatus',
  'paymentUrl',
  'sentAt',
  'viewedAt',
  'supersededById',
] as const;

export function buildRevisionCreateData(
  source: RevisionSource,
  input: { userId: string; reference: string }
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    reference: input.reference,
    title: source.title,
    status: 'DRAFT',
    tenantId: source.tenantId,
    clientId: source.clientId,
    createdById: input.userId,
    validUntil: source.validUntil,
    contractStartDate: source.contractStartDate,
    discountType: source.discountType,
    discountValue: source.discountValue,
    vatRate: source.vatRate,
    subtotalPence: source.subtotalPence,
    discountAmountPence: source.discountAmountPence,
    vatAmountPence: source.vatAmountPence,
    totalPence: source.totalPence,
    paymentTerms: source.paymentTerms,
    paymentFrequency: source.paymentFrequency,
    coverLetter: source.coverLetter,
    proposalSummary: source.proposalSummary,
    terms: source.terms,
    notes: source.notes,
    customFields: source.customFields,
    engagementLetter: source.engagementLetter,
    originalProposalId: source.id,
    isRenewal: false,
    services: {
      create: source.services.map((line) => {
        const copy: Record<string, unknown> = {};
        for (const key of LINE_COPY_KEYS) copy[key] = line[key];
        return copy;
      }),
    },
  };
  for (const key of REVISION_OMITTED_FIELDS) {
    if (key !== 'status' && key in data) delete data[key];
  }
  return data;
}

const SOURCE_INCLUDE = {
  services: { orderBy: { sortOrder: 'asc' as const } },
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
  createdBy: { select: { id: true, firstName: true, lastName: true } },
};

export async function createRevisionDraft(ctx: GrokActor, proposalId: string) {
  if (!proposalId) throw new Error('proposal_id is required.');
  const source = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId: ctx.tenantId },
    include: { services: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!source) throw new Error('Proposal not found in this practice.');

  const reference = generateReference('PROP');
  const before = JSON.stringify(source);

  const created = await prisma.$transaction(async (tx) => {
    await lockProposalRow(tx, source.id, ctx.tenantId);
    const fresh = await tx.proposal.findFirst({
      where: { id: source.id, tenantId: ctx.tenantId },
      include: { services: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!fresh) throw new Error('Proposal not found in this practice.');
    const data = buildRevisionCreateData(fresh as RevisionSource, {
      userId: ctx.userId,
      reference,
    });
    const proposal = await tx.proposal.create({
      data: data as never,
      select: { id: true, reference: true },
    });
    await writeGrokAudit(tx, {
      ctx,
      proposalId: proposal.id,
      tool: 'engage_create_revision_draft',
      summary: `Created draft ${proposal.reference} as a copy of ${fresh.reference}. The original was not changed.`,
      changes: {
        source_proposal_id: fresh.id,
        source_reference: fresh.reference,
        source_status: fresh.status,
        new_reference: proposal.reference,
      },
    });
    return proposal;
  });

  const after = JSON.stringify(source);
  if (after !== before) {
    throw new Error('The original proposal was changed. The copy was refused.');
  }

  const loaded = await prisma.proposal.findFirst({
    where: { id: created.id, tenantId: ctx.tenantId },
    include: SOURCE_INCLUDE,
  });
  if (!loaded) throw new Error('The new draft could not be read back.');
  return {
    ...presentProposal(loaded as never),
    copied_from: { id: source.id, reference: source.reference, status: source.status },
    original_unchanged: true,
  };
}
