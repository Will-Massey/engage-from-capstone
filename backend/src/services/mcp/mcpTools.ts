import { prisma } from '../../config/database.js';
import { penceToPounds } from '../../utils/proposalPricing.js';
import { parseScopes } from './mcpKeys.js';

export type McpToolContext = {
  tenantId: string;
  tenantName: string;
  keyId: string;
  actorUserId: string | null;
  scopes: Set<string>;
};

type JsonSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type McpToolDef = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  write?: boolean;
  handler: (args: Record<string, unknown>, ctx: McpToolContext) => Promise<unknown>;
};

const LIMIT = { min: 1, max: 50, def: 20 };

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

export const MCP_TOOLS: McpToolDef[] = [
  {
    name: 'engage_practice_summary',
    description:
      'Snapshot of this practice: open jobs by board column, overdue count, and recent proposals. Start here.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async (_args, ctx) => {
      const [jobs, overdue, proposals, clients] = await Promise.all([
        prisma.job.groupBy({
          by: ['boardColumn'],
          where: { tenantId: ctx.tenantId, isActive: true },
          _count: { _all: true },
        }),
        prisma.job.count({
          where: {
            tenantId: ctx.tenantId,
            isActive: true,
            dueAt: { lt: new Date() },
            boardColumn: { not: 'COMPLETE' },
          },
        }),
        prisma.proposal.groupBy({
          by: ['status'],
          where: { tenantId: ctx.tenantId },
          _count: { _all: true },
        }),
        prisma.client.count({ where: { tenantId: ctx.tenantId, isActive: true } }),
      ]);
      return {
        practice: ctx.tenantName,
        active_clients: clients,
        overdue_jobs: overdue,
        jobs_by_column: Object.fromEntries(jobs.map((j) => [j.boardColumn, j._count._all])),
        proposals_by_status: Object.fromEntries(proposals.map((p) => [p.status, p._count._all])),
      };
    },
  },
  {
    name: 'engage_search_clients',
    description: 'Search clients by name, email, or company number.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name, email, or Companies House number' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
        offset: { type: 'integer', minimum: 0 },
      },
      required: ['query'],
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const query = str(args.query);
      if (query.length < 2) {
        throw new Error('query must be at least 2 characters');
      }
      const limit = clampLimit(args.limit);
      const offset = clampOffset(args.offset);
      const where = {
        tenantId: ctx.tenantId,
        isActive: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' as const } },
          { contactEmail: { contains: query, mode: 'insensitive' as const } },
          { contactName: { contains: query, mode: 'insensitive' as const } },
          { companyNumber: { contains: query, mode: 'insensitive' as const } },
        ],
      };
      const [total, rows] = await Promise.all([
        prisma.client.count({ where }),
        prisma.client.findMany({
          where,
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
            industry: true,
          },
        }),
      ]);
      return page(rows, total, offset, limit);
    },
  },
  {
    name: 'engage_get_client',
    description: 'Load one client, their open jobs, and latest proposals.',
    inputSchema: {
      type: 'object',
      properties: { client_id: { type: 'string' } },
      required: ['client_id'],
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const id = str(args.client_id);
      const client = await prisma.client.findFirst({
        where: { id, tenantId: ctx.tenantId },
        select: {
          id: true,
          name: true,
          contactName: true,
          contactEmail: true,
          contactPhone: true,
          companyNumber: true,
          companyType: true,
          vatRegistered: true,
          vatNumber: true,
          industry: true,
          yearEnd: true,
          mtditsaStatus: true,
        },
      });
      if (!client) throw new Error('Client not found in this practice');
      const [jobs, proposals] = await Promise.all([
        prisma.job.findMany({
          where: { tenantId: ctx.tenantId, clientId: id, isActive: true },
          orderBy: { updatedAt: 'desc' },
          take: 10,
          select: {
            id: true,
            reference: true,
            title: true,
            boardColumn: true,
            dueAt: true,
          },
        }),
        prisma.proposal.findMany({
          where: { tenantId: ctx.tenantId, clientId: id },
          orderBy: { updatedAt: 'desc' },
          take: 8,
          select: {
            id: true,
            reference: true,
            status: true,
            totalPence: true,
            updatedAt: true,
          },
        }),
      ]);
      return {
        ...client,
        jobs,
        proposals: proposals.map((p) => ({
          id: p.id,
          reference: p.reference,
          status: p.status,
          total_gbp: gbp(p.totalPence),
          updated_at: p.updatedAt,
        })),
      };
    },
  },
  {
    name: 'engage_list_jobs',
    description: 'List delivery jobs. Filter by board column, client, or search text.',
    inputSchema: {
      type: 'object',
      properties: {
        board_column: {
          type: 'string',
          description:
            'REQUEST_RECORDS | RECORDS_RECEIVED | IN_PROGRESS | HELP_NEEDED | IN_REVIEW | COMPLETE',
        },
        client_id: { type: 'string' },
        query: { type: 'string', description: 'Title, reference, or client name' },
        overdue_only: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
        offset: { type: 'integer', minimum: 0 },
      },
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const limit = clampLimit(args.limit);
      const offset = clampOffset(args.offset);
      const board = str(args.board_column);
      const clientId = str(args.client_id);
      const q = str(args.query);
      const where: Record<string, unknown> = { tenantId: ctx.tenantId, isActive: true };
      if (board) where.boardColumn = board;
      if (clientId) where.clientId = clientId;
      if (args.overdue_only === true) {
        where.dueAt = { lt: new Date() };
        where.boardColumn = board || { not: 'COMPLETE' };
      }
      if (q) {
        where.OR = [
          { title: { contains: q, mode: 'insensitive' } },
          { reference: { contains: q, mode: 'insensitive' } },
          { client: { name: { contains: q, mode: 'insensitive' } } },
        ];
      }
      const [total, rows] = await Promise.all([
        prisma.job.count({ where: where as any }),
        prisma.job.findMany({
          where: where as any,
          orderBy: [{ dueAt: 'asc' }, { updatedAt: 'desc' }],
          skip: offset,
          take: limit,
          select: {
            id: true,
            reference: true,
            title: true,
            boardColumn: true,
            dueAt: true,
            proposedFeePence: true,
            client: { select: { id: true, name: true } },
            assignee: { select: { firstName: true, lastName: true } },
          },
        }),
      ]);
      return page(
        rows.map((j) => ({
          id: j.id,
          reference: j.reference,
          title: j.title,
          board_column: j.boardColumn,
          due_at: j.dueAt,
          fee_gbp: gbp(j.proposedFeePence),
          client: j.client,
          assignee: j.assignee ? `${j.assignee.firstName} ${j.assignee.lastName}`.trim() : null,
        })),
        total,
        offset,
        limit
      );
    },
  },
  {
    name: 'engage_get_job',
    description: 'Job detail: phases, checklist progress, and the latest staff notes.',
    inputSchema: {
      type: 'object',
      properties: { job_id: { type: 'string' } },
      required: ['job_id'],
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const job = await prisma.job.findFirst({
        where: { id: str(args.job_id), tenantId: ctx.tenantId },
        include: {
          client: { select: { id: true, name: true, contactName: true } },
          assignee: { select: { firstName: true, lastName: true } },
          phases: {
            orderBy: { sortOrder: 'asc' },
            include: { checklistItems: { orderBy: { sortOrder: 'asc' } } },
          },
          activities: {
            orderBy: { createdAt: 'desc' },
            take: 8,
            include: { actor: { select: { firstName: true, lastName: true } } },
          },
        },
      });
      if (!job) throw new Error('Job not found in this practice');
      return {
        id: job.id,
        reference: job.reference,
        title: job.title,
        board_column: job.boardColumn,
        due_at: job.dueAt,
        fee_gbp: gbp(job.proposedFeePence),
        client: job.client,
        assignee: job.assignee ? `${job.assignee.firstName} ${job.assignee.lastName}`.trim() : null,
        phases: job.phases.map((p) => ({
          name: p.name,
          is_complete: p.isComplete,
          progress_pct: p.progressPct,
          checklist: p.checklistItems.map((c) => ({
            label: c.label,
            done: c.isDone,
          })),
        })),
        recent_notes: job.activities.map((a) => ({
          at: a.createdAt,
          kind: a.kind,
          message: a.message,
          actor: a.actor ? `${a.actor.firstName} ${a.actor.lastName}`.trim() : null,
        })),
      };
    },
  },
  {
    name: 'engage_list_proposals',
    description: 'List engagement letters / proposals. Filter by status or search text.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'DRAFT | SENT | VIEWED | ACCEPTED | DECLINED | EXPIRED | WITHDRAWN',
        },
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
        offset: { type: 'integer', minimum: 0 },
      },
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const limit = clampLimit(args.limit);
      const offset = clampOffset(args.offset);
      const status = str(args.status);
      const q = str(args.query);
      const where: Record<string, unknown> = { tenantId: ctx.tenantId };
      if (status) where.status = status;
      if (q) {
        where.OR = [
          { reference: { contains: q, mode: 'insensitive' } },
          { title: { contains: q, mode: 'insensitive' } },
          { client: { name: { contains: q, mode: 'insensitive' } } },
        ];
      }
      const [total, rows] = await Promise.all([
        prisma.proposal.count({ where: where as any }),
        prisma.proposal.findMany({
          where: where as any,
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
          total_gbp: gbp(p.totalPence),
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
    description: 'Proposal detail with line items in pounds. Does not include signature images.',
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
          client: { select: { id: true, name: true, contactName: true, contactEmail: true } },
          services: { orderBy: { sortOrder: 'asc' } },
        },
      });
      if (!proposal) throw new Error('Proposal not found in this practice');
      return {
        id: proposal.id,
        reference: proposal.reference,
        title: proposal.title,
        status: proposal.status,
        valid_until: proposal.validUntil,
        client: proposal.client,
        totals: {
          subtotal_gbp: gbp(proposal.subtotalPence),
          vat_gbp: gbp(proposal.vatAmountPence),
          total_gbp: gbp(proposal.totalPence),
        },
        services: proposal.services.map((s) => ({
          name: s.name,
          billing_frequency: s.billingFrequency,
          quantity: s.quantity,
          line_total_gbp: gbp(s.lineTotalPence),
          gross_gbp: gbp(s.grossTotalPence),
        })),
      };
    },
  },
  {
    name: 'engage_add_job_note',
    description:
      'Add a staff note on a job. Use when the user asks you to record something on the job. Does not email the client.',
    write: true,
    inputSchema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        message: { type: 'string', description: 'Note text, max 2000 characters' },
      },
      required: ['job_id', 'message'],
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      if (!ctx.scopes.has('write_notes')) {
        throw new Error('This MCP key is read-only. Ask a partner to mint a key with write_notes.');
      }
      const message = str(args.message);
      if (!message) throw new Error('message is required');
      if (message.length > 2000) throw new Error('message must be 2000 characters or fewer');
      const job = await prisma.job.findFirst({
        where: { id: str(args.job_id), tenantId: ctx.tenantId },
        select: { id: true, reference: true },
      });
      if (!job) throw new Error('Job not found in this practice');
      const activity = await prisma.jobActivity.create({
        data: {
          kind: 'NOTE',
          message,
          jobId: job.id,
          actorId: ctx.actorUserId,
          metadata: JSON.stringify({ source: 'mcp', keyId: ctx.keyId }),
        },
      });
      return { ok: true, job_reference: job.reference, note_id: activity.id };
    },
  },
];

export function listMcpToolsForProtocol() {
  return MCP_TOOLS.map((t) => ({
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

export async function callMcpTool(
  name: string,
  rawArgs: unknown,
  ctx: McpToolContext
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const tool = MCP_TOOLS.find((t) => t.name === name);
  if (!tool) {
    return {
      ok: false,
      error: `Unknown tool '${name}'. Call tools/list for the Engage tools on this server.`,
    };
  }
  if (tool.write && !ctx.scopes.has('write_notes')) {
    return {
      ok: false,
      error: 'This MCP key cannot write. Ask a partner to generate a new key with write_notes.',
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
