import { prisma } from '../../config/database.js';
import { penceToPounds } from '../../utils/proposalPricing.js';
import { resolveCatalogBillingCycle } from '@uk-proposal-platform/shared';
import { parseScopes } from './grokKeys.js';
import { vatPercentForTemplate, presentProposal } from './grokDraft.js';
import {
  addDraftLine,
  createDraftProposal,
  removeDraftLine,
  updateDraftLine,
  updateDraftNotes,
} from './grokDraft.js';
import type { GrokActor } from './grokAudit.js';

export type GrokToolContext = GrokActor & {
  tenantName: string;
  userName: string;
  scopes: Set<string>;
};

type JsonSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

type GrokToolDef = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  write?: boolean;
  handler: (args: Record<string, unknown>, ctx: GrokToolContext) => Promise<unknown>;
};

const LIMIT = { min: 1, max: 50, def: 20 };
const PROPOSAL_STATUSES = [
  'DRAFT',
  'SENT',
  'VIEWED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'WITHDRAWN',
  'ARCHIVED',
  'LOST',
];

const SERVICE_CATEGORIES = new Set([
  'COMPLIANCE',
  'ADVISORY',
  'TAX',
  'PAYROLL',
  'BOOKKEEPING',
  'AUDIT',
  'CONSULTING',
  'TECHNICAL',
  'SPECIALIZED',
]);

function clampLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return LIMIT.def;
  return Math.min(LIMIT.max, Math.max(LIMIT.min, Math.floor(n)));
}

function clampOffset(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(10_000, Math.floor(n));
}

function page<T>(items: T[], total: number, offset: number, limit: number) {
  return {
    total,
    count: items.length,
    offset,
    limit,
    has_more: offset + items.length < total,
    next_offset: offset + items.length < total ? offset + limit : null,
    items,
  };
}

function gbp(pence: number | null | undefined): number {
  return Number(penceToPounds(pence).toFixed(2));
}

function str(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

export const GROK_TOOLS: GrokToolDef[] = [
  {
    name: 'engage_list_clients',
    description:
      'List clients in this practice. Leave query empty to list them. A query matches name, email, or company number.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        include_inactive: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
        offset: { type: 'integer', minimum: 0 },
      },
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const query = str(args.query);
      if (query && query.length < 2) {
        throw new Error('query must be at least 2 characters, or leave it out to list clients.');
      }
      const limit = clampLimit(args.limit);
      const offset = clampOffset(args.offset);
      const where: Record<string, unknown> = { tenantId: ctx.tenantId };
      if (args.include_inactive !== true) where.isActive = true;
      if (query) {
        where.OR = [
          { name: { contains: query, mode: 'insensitive' } },
          { contactEmail: { contains: query, mode: 'insensitive' } },
          { contactName: { contains: query, mode: 'insensitive' } },
          { companyNumber: { contains: query, mode: 'insensitive' } },
        ];
      }
      const [total, rows] = await Promise.all([
        prisma.client.count({ where: where as never }),
        prisma.client.findMany({
          where: where as never,
          orderBy: { name: 'asc' },
          skip: offset,
          take: limit,
          select: {
            id: true,
            name: true,
            contactName: true,
            contactEmail: true,
            companyNumber: true,
            companyType: true,
            isActive: true,
          },
        }),
      ]);
      return page(
        rows.map((c) => ({
          id: c.id,
          name: c.name,
          contact_name: c.contactName,
          contact_email: c.contactEmail,
          company_number: c.companyNumber,
          company_type: c.companyType,
          is_active: c.isActive,
        })),
        total,
        offset,
        limit
      );
    },
  },
  {
    name: 'engage_list_proposals',
    description:
      'List proposals in this practice. Filter by status or client. This does not change anything.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: PROPOSAL_STATUSES.join(' | ') },
        client_id: { type: 'string' },
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
        offset: { type: 'integer', minimum: 0 },
      },
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const status = str(args.status).toUpperCase();
      if (status && !PROPOSAL_STATUSES.includes(status)) {
        throw new Error(`Status must be one of ${PROPOSAL_STATUSES.join(', ')}.`);
      }
      const query = str(args.query);
      const limit = clampLimit(args.limit);
      const offset = clampOffset(args.offset);
      const where: Record<string, unknown> = { tenantId: ctx.tenantId };
      if (status) where.status = status;
      const clientId = str(args.client_id);
      if (clientId) where.clientId = clientId;
      if (query) {
        where.OR = [
          { reference: { contains: query, mode: 'insensitive' } },
          { title: { contains: query, mode: 'insensitive' } },
          { client: { name: { contains: query, mode: 'insensitive' } } },
        ];
      }
      const [total, rows] = await Promise.all([
        prisma.proposal.count({ where: where as never }),
        prisma.proposal.findMany({
          where: where as never,
          orderBy: { updatedAt: 'desc' },
          skip: offset,
          take: limit,
          select: {
            id: true,
            reference: true,
            title: true,
            status: true,
            totalPence: true,
            validUntil: true,
            updatedAt: true,
            client: { select: { id: true, name: true } },
          },
        }),
      ]);
      return page(
        rows.map((p) => ({
          id: p.id,
          reference: p.reference,
          title: p.title,
          status: p.status,
          gross_gbp: gbp(p.totalPence),
          valid_until: p.validUntil,
          updated_at: p.updatedAt,
          client: p.client,
        })),
        total,
        offset,
        limit
      );
    },
  },
  {
    name: 'engage_get_proposal',
    description:
      'Read one proposal in full: lines, fees, billing frequency, VAT, notes, and totals. Does not include signature images or payment secrets.',
    inputSchema: {
      type: 'object',
      properties: { proposal_id: { type: 'string' } },
      required: ['proposal_id'],
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const proposal = await prisma.proposal.findFirst({
        where: { id: str(args.proposal_id), tenantId: ctx.tenantId },
        include: {
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
          services: { orderBy: { sortOrder: 'asc' } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      if (!proposal) throw new Error('Proposal not found in this practice.');
      return presentProposal(proposal);
    },
  },
  {
    name: 'engage_list_services',
    description:
      'List this practice catalogue and the price stored on each service. A new draft line uses that price unless you pass display_price_gbp.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
        offset: { type: 'integer', minimum: 0 },
      },
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const query = str(args.query);
      const limit = clampLimit(args.limit);
      const offset = clampOffset(args.offset);
      const where: Record<string, unknown> = { tenantId: ctx.tenantId, isActive: true };
      if (query) {
        const or: Record<string, unknown>[] = [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ];
        const category = query.toUpperCase();
        if (SERVICE_CATEGORIES.has(category)) or.push({ category });
        where.OR = or;
      }
      const [total, rows] = await Promise.all([
        prisma.serviceTemplate.count({ where: where as never }),
        prisma.serviceTemplate.findMany({
          where: where as never,
          orderBy: [{ category: 'asc' }, { name: 'asc' }],
          skip: offset,
          take: limit,
        }),
      ]);
      return page(
        rows.map((s) => {
          const price = s.priceAmount || s.basePrice || 0;
          const billing = resolveCatalogBillingCycle(s);
          return {
            id: s.id,
            name: s.name,
            category: s.category,
            subcategory: s.subcategory,
            description: s.description,
            price_gbp: Number(price.toFixed(2)),
            billing_frequency: billing,
            price_display_mode: s.priceDisplayMode,
            vat_rate: vatPercentForTemplate(s),
            is_popular: s.isPopular,
          };
        }),
        total,
        offset,
        limit
      );
    },
  },
  {
    name: 'engage_create_draft_proposal',
    description:
      'Create a DRAFT proposal for a client in this practice. Always stays a draft. Uses catalogue prices unless display_price_gbp is set.',
    write: true,
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'string' },
        title: { type: 'string' },
        notes: { type: 'string' },
        lines: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              service_id: { type: 'string' },
              display_price_gbp: { type: 'number' },
              billing_frequency: { type: 'string' },
              quantity: { type: 'number' },
              hourly_billing_mode: { type: 'string', description: 'ONE_OFF or MONTHLY_ACTUAL' },
              description: { type: 'string' },
            },
            required: ['service_id'],
          },
        },
      },
      required: ['client_id', 'lines'],
      additionalProperties: false,
    },
    handler: (args, ctx) => createDraftProposal(ctx, args),
  },
  {
    name: 'engage_add_draft_line',
    description:
      'Add a catalogue service to a DRAFT proposal. Refuses any proposal that is not a draft.',
    write: true,
    inputSchema: {
      type: 'object',
      properties: {
        proposal_id: { type: 'string' },
        service_id: { type: 'string' },
        display_price_gbp: {
          type: 'number',
          description: 'Unit price in pounds. Hourly: the rate.',
        },
        billing_frequency: { type: 'string' },
        quantity: { type: 'number' },
        hourly_billing_mode: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['proposal_id', 'service_id'],
      additionalProperties: false,
    },
    handler: (args, ctx) => addDraftLine(ctx, args),
  },
  {
    name: 'engage_update_draft_line',
    description:
      'On a DRAFT only, change a line fee, billing frequency, quantity, hourly mode, or line note. Refuses anything that is not a draft.',
    write: true,
    inputSchema: {
      type: 'object',
      properties: {
        proposal_id: { type: 'string' },
        line_id: { type: 'string' },
        display_price_gbp: { type: 'number' },
        billing_frequency: { type: 'string' },
        quantity: { type: 'number' },
        hourly_billing_mode: { type: 'string' },
        description: { type: 'string' },
        notes: { type: 'string', description: 'Line note. Same as description.' },
      },
      required: ['proposal_id', 'line_id'],
      additionalProperties: false,
    },
    handler: (args, ctx) => updateDraftLine(ctx, args),
  },
  {
    name: 'engage_remove_draft_line',
    description: 'Remove one line from a DRAFT proposal. Refuses anything that is not a draft.',
    write: true,
    inputSchema: {
      type: 'object',
      properties: {
        proposal_id: { type: 'string' },
        line_id: { type: 'string' },
      },
      required: ['proposal_id', 'line_id'],
      additionalProperties: false,
    },
    handler: (args, ctx) => removeDraftLine(ctx, args),
  },
  {
    name: 'engage_update_draft_notes',
    description:
      'Replace the notes on a DRAFT proposal. Pass an empty string to clear them. Refuses anything that is not a draft.',
    write: true,
    inputSchema: {
      type: 'object',
      properties: {
        proposal_id: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['proposal_id', 'notes'],
      additionalProperties: false,
    },
    handler: (args, ctx) => updateDraftNotes(ctx, args),
  },
];

export function listGrokToolsForProtocol() {
  return GROK_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: {
      readOnlyHint: !t.write,
      destructiveHint: false,
      idempotentHint: !t.write,
      openWorldHint: false,
    },
  }));
}

export async function callGrokTool(
  name: string,
  rawArgs: unknown,
  ctx: GrokToolContext
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const tool = GROK_TOOLS.find((t) => t.name === name);
  if (!tool) {
    return {
      ok: false,
      error: `Unknown tool '${name}'. Call tools/list. This connector cannot send, email, or sign.`,
    };
  }
  if (!tool.write && !ctx.scopes.has('read')) {
    return { ok: false, error: 'This token cannot read Engage.' };
  }
  if (tool.write && !ctx.scopes.has('draft_proposals')) {
    return {
      ok: false,
      error: 'This token cannot change proposals. It can only read.',
    };
  }
  const args =
    rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
      ? (rawArgs as Record<string, unknown>)
      : {};
  try {
    const data = await tool.handler(args, ctx);
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tool failed';
    return { ok: false, error: message };
  }
}

export { parseScopes };
