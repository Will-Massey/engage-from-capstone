import { prisma } from '../../config/database.js';
import { formatPaymentTerms, parseProposalDateInput } from '../../utils/tenantProposalSettings.js';
import { assertBotMayMutateProposal } from '../proposals/proposalWriteGuard.js';
import { writeGrokAudit, type GrokActor } from './grokAudit.js';
import { presentProposal } from './grokDraft.js';

const TITLE_MAX = 200;
const PAYMENT_TERMS_MIN_DAYS = 1;
const PAYMENT_TERMS_MAX_DAYS = 90;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const TERMS_PHRASE = /^(\d+)\s*days?$/i;

const ALLOWED = ['proposal_id', 'title', 'valid_until', 'payment_terms'];

const INCLUDE = {
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

export type DraftDetailsPatch = {
  proposalId: string;
  title?: string;
  validUntil?: Date;
  paymentTerms?: string;
};

function termsFromDays(days: number): string {
  if (!Number.isInteger(days) || days < PAYMENT_TERMS_MIN_DAYS || days > PAYMENT_TERMS_MAX_DAYS) {
    throw new Error('Payment terms must be a number of days from 1 to 90, such as 14 days.');
  }
  return formatPaymentTerms(days);
}

export function parsePaymentTerms(raw: unknown): string {
  if (typeof raw === 'number') return termsFromDays(raw);
  if (typeof raw !== 'string') {
    throw new Error('Payment terms must be a number of days from 1 to 90, such as 14 days.');
  }
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return termsFromDays(Number(trimmed));
  const match = trimmed.match(TERMS_PHRASE);
  if (!match) {
    throw new Error('Payment terms must be a number of days from 1 to 90, such as 14 days.');
  }
  return termsFromDays(Number(match[1]));
}

export function parseFutureValidUntil(raw: unknown): Date {
  if (typeof raw !== 'string') {
    throw new Error('valid_until must be a date, as YYYY-MM-DD.');
  }
  const value = raw.trim();
  if (!DATE_ONLY.test(value) && !ISO_DATE.test(value)) {
    throw new Error('valid_until must be YYYY-MM-DD or an ISO date.');
  }
  const parsed = parseProposalDateInput(value);
  if (!parsed) throw new Error('valid_until must be YYYY-MM-DD or an ISO date.');
  const day = parsed.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (day < today) throw new Error('valid_until must be today or a future date.');
  return parsed;
}

export function parseDraftDetailsPatch(args: Record<string, unknown>): DraftDetailsPatch {
  for (const key of Object.keys(args)) {
    if (!ALLOWED.includes(key)) {
      throw new Error(
        `Unexpected field "${key}". This assistant cannot change that. Caroline sends and signs proposals in Engage.`
      );
    }
  }
  const proposalId = typeof args.proposal_id === 'string' ? args.proposal_id.trim() : '';
  if (!proposalId) throw new Error('proposal_id is required.');

  const patch: DraftDetailsPatch = { proposalId };
  if (args.title !== undefined) {
    if (typeof args.title !== 'string') throw new Error('Title must be text.');
    const title = args.title.trim();
    if (title.length < 1 || title.length > TITLE_MAX) {
      throw new Error('Title must be between 1 and 200 characters.');
    }
    patch.title = title;
  }
  if (args.valid_until !== undefined) patch.validUntil = parseFutureValidUntil(args.valid_until);
  if (args.payment_terms !== undefined) patch.paymentTerms = parsePaymentTerms(args.payment_terms);
  if (
    patch.title === undefined &&
    patch.validUntil === undefined &&
    patch.paymentTerms === undefined
  ) {
    throw new Error('Say what to change: the title, the valid until date, or the payment terms.');
  }
  return patch;
}

function ukDate(value: Date): string {
  return value.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export async function updateDraftDetails(ctx: GrokActor, args: Record<string, unknown>) {
  const patch = parseDraftDetailsPatch(args);
  const existing = await prisma.proposal.findFirst({
    where: { id: patch.proposalId, tenantId: ctx.tenantId },
    select: { id: true, reference: true },
  });
  if (!existing) throw new Error('Proposal not found in this practice.');

  await prisma.$transaction(async (tx) => {
    await assertBotMayMutateProposal(tx as never, {
      proposalId: existing.id,
      tenantId: ctx.tenantId,
      purpose: 'draft_edit',
    });
    const current = await tx.proposal.findFirst({
      where: { id: existing.id, tenantId: ctx.tenantId },
      select: { title: true, validUntil: true, paymentTerms: true },
    });
    if (!current) throw new Error('Proposal not found in this practice.');

    const data: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const parts: string[] = [];
    if (patch.title !== undefined) {
      data.title = patch.title;
      before.title = current.title;
      after.title = patch.title;
      parts.push(`title to "${patch.title}"`);
    }
    if (patch.validUntil) {
      data.validUntil = patch.validUntil;
      before.valid_until = current.validUntil;
      after.valid_until = patch.validUntil.toISOString();
      parts.push(`valid until to ${ukDate(patch.validUntil)}`);
    }
    if (patch.paymentTerms) {
      data.paymentTerms = patch.paymentTerms;
      before.payment_terms = current.paymentTerms;
      after.payment_terms = patch.paymentTerms;
      parts.push(`payment terms to ${patch.paymentTerms}`);
    }

    await tx.proposal.update({
      where: { id: existing.id },
      data,
    });
    await writeGrokAudit(tx, {
      ctx,
      proposalId: existing.id,
      tool: 'engage_update_draft_details',
      summary: `Updated draft ${existing.reference}: ${parts.join(', ')}.`,
      changes: { before, after },
    });
  });

  const loaded = await prisma.proposal.findFirst({
    where: { id: existing.id, tenantId: ctx.tenantId },
    include: INCLUDE,
  });
  if (!loaded) throw new Error('Proposal not found in this practice.');
  return presentProposal(loaded as never);
}
