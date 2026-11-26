import { prisma } from '../../config/database.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { parseDraftDetailsPatch } from '../grok/grokDetails.js';
import { callGrokTool, type GrokToolContext } from '../grok/grokTools.js';
import { readBotChangeDecision } from '../proposals/proposalWriteGuard.js';
import { PENDING_CHANGE_MS } from './xaiConfig.js';

export type VoiceActor = {
  userId: string;
  tenantId: string;
  userName: string;
  tenantName: string;
};

const PROPOSE_TO_TOOL: Record<string, string> = {
  propose_create_draft: 'engage_create_draft_proposal',
  propose_add_line: 'engage_add_draft_line',
  propose_update_line: 'engage_update_draft_line',
  propose_remove_line: 'engage_remove_draft_line',
  propose_update_notes: 'engage_update_draft_notes',
  propose_update_details: 'engage_update_draft_details',
  propose_revert_to_draft: 'engage_revert_to_draft',
  propose_revision_draft: 'engage_create_revision_draft',
};

const READ_TOOLS = new Set([
  'engage_list_clients',
  'engage_list_proposals',
  'engage_get_proposal',
  'engage_get_proposal_history',
  'engage_list_services',
]);

function str(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

function ukDate(value: Date): string {
  return value.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function voiceContext(actor: VoiceActor): GrokToolContext {
  return {
    tokenId: '',
    userId: actor.userId,
    tenantId: actor.tenantId,
    userName: actor.userName,
    tenantName: actor.tenantName,
    scopes: new Set(['read', 'draft_proposals']),
  };
}

function onlyPendingId(args: Record<string, unknown>): string {
  const keys = Object.keys(args);
  if (keys.length !== 1 || keys[0] !== 'pending_change_id') {
    throw new ApiError(
      'PENDING_ID_ONLY',
      'confirm_pending_change takes only the pending change id.',
      400
    );
  }
  const id = str(args.pending_change_id);
  if (!id) throw new ApiError('PENDING_ID_ONLY', 'The pending change id is required.', 400);
  return id;
}

async function proposalBrief(tenantId: string, proposalId: string) {
  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId },
    select: {
      id: true,
      reference: true,
      title: true,
      status: true,
      notes: true,
      shareToken: true,
      publicAccessEnabled: true,
      services: {
        select: { id: true, name: true, displayPricePence: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  if (!proposal) throw new ApiError('NOT_FOUND', 'Proposal not found in this practice.', 404);
  return proposal;
}

export async function previewVoiceChange(
  actor: VoiceActor,
  name: string,
  args: Record<string, unknown>
): Promise<{
  tool: string;
  proposalId: string | null;
  summary: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  payload: { name: string; arguments: Record<string, unknown> };
}> {
  const tool = PROPOSE_TO_TOOL[name];
  if (!tool) throw new ApiError('UNKNOWN_TOOL', 'That action is not available.', 400);
  if (name === 'propose_update_details') {
    let patch;
    try {
      patch = parseDraftDetailsPatch(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Those details are not valid.';
      throw new ApiError('VALIDATION_ERROR', message, 400);
    }
    const decision = await readBotChangeDecision(prisma as never, {
      proposalId: patch.proposalId,
      tenantId: actor.tenantId,
    });
    if (!decision) throw new ApiError('NOT_FOUND', 'Proposal not found in this practice.', 404);
    if (!decision.canBotChange) {
      throw new ApiError(
        'PROPOSAL_LOCKED',
        decision.reason ?? 'This proposal cannot be changed.',
        409
      );
    }
    const proposal = await prisma.proposal.findFirst({
      where: { id: patch.proposalId, tenantId: actor.tenantId },
      select: {
        id: true,
        reference: true,
        title: true,
        validUntil: true,
        paymentTerms: true,
      },
    });
    if (!proposal) throw new ApiError('NOT_FOUND', 'Proposal not found in this practice.', 404);
    const before = {
      reference: proposal.reference,
      title: proposal.title,
      valid_until: proposal.validUntil.toISOString(),
      payment_terms: proposal.paymentTerms,
    };
    const after = {
      ...before,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.validUntil ? { valid_until: patch.validUntil.toISOString() } : {}),
      ...(patch.paymentTerms ? { payment_terms: patch.paymentTerms } : {}),
    };
    const changes: string[] = [];
    if (patch.title !== undefined) {
      changes.push(`title from "${proposal.title}" to "${patch.title}"`);
    }
    if (patch.validUntil) {
      changes.push(
        `valid until from ${ukDate(proposal.validUntil)} to ${ukDate(patch.validUntil)}`
      );
    }
    if (patch.paymentTerms) {
      changes.push(`payment terms from "${proposal.paymentTerms}" to "${patch.paymentTerms}"`);
    }
    return {
      tool,
      proposalId: proposal.id,
      summary: `Change draft ${proposal.reference}: ${changes.join(', ')}.`,
      before,
      after,
      payload: {
        name: tool,
        arguments: {
          proposal_id: proposal.id,
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.validUntil ? { valid_until: patch.validUntil.toISOString() } : {}),
          ...(patch.paymentTerms ? { payment_terms: patch.paymentTerms } : {}),
        },
      },
    };
  }
  if (name === 'propose_update_notes') {
    const proposal = await proposalBrief(actor.tenantId, str(args.proposal_id));
    const notes = typeof args.notes === 'string' ? args.notes : '';
    return {
      tool,
      proposalId: proposal.id,
      summary: `Change the notes on ${proposal.reference} from "${proposal.notes ?? ''}" to "${notes}".`,
      before: { reference: proposal.reference, notes: proposal.notes },
      after: { reference: proposal.reference, notes },
      payload: { name: tool, arguments: { proposal_id: proposal.id, notes } },
    };
  }
  if (name === 'propose_revert_to_draft') {
    const proposal = await proposalBrief(actor.tenantId, str(args.proposal_id));
    return {
      tool,
      proposalId: proposal.id,
      summary: `Return ${proposal.reference} from ${proposal.status} to draft. The client's link stops straight away.`,
      before: {
        reference: proposal.reference,
        status: proposal.status,
        client_link: proposal.shareToken && proposal.publicAccessEnabled ? 'working' : 'none',
      },
      after: { reference: proposal.reference, status: 'DRAFT', client_link: 'stopped' },
      payload: { name: tool, arguments: { proposal_id: proposal.id } },
    };
  }
  if (name === 'propose_revision_draft') {
    const proposal = await proposalBrief(actor.tenantId, str(args.proposal_id));
    return {
      tool,
      proposalId: proposal.id,
      summary: `Create a new draft copied from ${proposal.reference} (${proposal.status}). The original stays as it is.`,
      before: { reference: proposal.reference, status: proposal.status, title: proposal.title },
      after: {
        reference: 'new draft',
        status: 'DRAFT',
        copied_from: proposal.reference,
        original_unchanged: true,
      },
      payload: { name: tool, arguments: { proposal_id: proposal.id } },
    };
  }
  if (
    name === 'propose_remove_line' ||
    name === 'propose_update_line' ||
    name === 'propose_add_line'
  ) {
    const proposal = await proposalBrief(actor.tenantId, str(args.proposal_id));
    const line = proposal.services.find((item) => item.id === str(args.line_id));
    const summary =
      name === 'propose_add_line'
        ? `Add a line to draft ${proposal.reference}.`
        : name === 'propose_remove_line'
          ? `Remove ${line?.name ?? 'a line'} from draft ${proposal.reference}.`
          : `Change ${line?.name ?? 'a line'} on draft ${proposal.reference}.`;
    return {
      tool,
      proposalId: proposal.id,
      summary,
      before: {
        reference: proposal.reference,
        lines: proposal.services.map((item) => item.name),
      },
      after: { ...args, proposal_id: proposal.id },
      payload: { name: tool, arguments: { ...args, proposal_id: proposal.id } },
    };
  }
  return {
    tool,
    proposalId: null,
    summary: 'Create a new draft proposal.',
    before: {},
    after: { ...args },
    payload: { name: tool, arguments: args },
  };
}

export function presentPending(row: {
  id: string;
  summary: string;
  beforeJson: string;
  afterJson: string;
  status: string;
  expiresAt: Date;
  proposalId: string | null;
  tool: string;
}) {
  return {
    id: row.id,
    tool: row.tool,
    proposal_id: row.proposalId,
    summary: row.summary,
    before: JSON.parse(row.beforeJson) as Record<string, unknown>,
    after: JSON.parse(row.afterJson) as Record<string, unknown>,
    status: row.status,
    expires_at: row.expiresAt.toISOString(),
  };
}

export async function createPendingChange(
  actor: VoiceActor,
  name: string,
  args: Record<string, unknown>
) {
  const preview = await previewVoiceChange(actor, name, args);
  const expiresAt = new Date(Date.now() + PENDING_CHANGE_MS);
  const row = await prisma.voicePendingChange.create({
    data: {
      userId: actor.userId,
      tenantId: actor.tenantId,
      tool: preview.tool,
      proposalId: preview.proposalId,
      summary: preview.summary,
      beforeJson: JSON.stringify(preview.before),
      afterJson: JSON.stringify(preview.after),
      payload: JSON.stringify(preview.payload),
      status: 'PENDING',
      expiresAt,
    },
  });
  return {
    ...presentPending(row),
    read_back: preview.summary,
    saved: false,
  };
}

export async function confirmPendingChange(actor: VoiceActor, rawArgs: Record<string, unknown>) {
  const pendingId = onlyPendingId(rawArgs);
  const claimed = await prisma.voicePendingChange.updateMany({
    where: {
      id: pendingId,
      userId: actor.userId,
      tenantId: actor.tenantId,
      status: 'PENDING',
      expiresAt: { gt: new Date() },
    },
    data: { status: 'APPLYING' },
  });
  if (claimed.count !== 1) {
    const row = await prisma.voicePendingChange.findFirst({
      where: { id: pendingId, userId: actor.userId, tenantId: actor.tenantId },
    });
    if (!row) throw new ApiError('NOT_FOUND', 'That change was not found.', 404);
    if (row.status === 'CONFIRMED') {
      throw new ApiError('ALREADY_CONFIRMED', 'That change is already saved.', 409);
    }
    if (row.expiresAt.getTime() <= Date.now() || row.status === 'EXPIRED') {
      if (row.status === 'PENDING') {
        await prisma.voicePendingChange.update({
          where: { id: row.id },
          data: { status: 'EXPIRED' },
        });
      }
      throw new ApiError('EXPIRED', 'That change has expired. Ask for it again.', 409);
    }
    throw new ApiError('NOT_PENDING', 'That change is no longer waiting to be confirmed.', 409);
  }

  const row = await prisma.voicePendingChange.findFirst({ where: { id: pendingId } });
  if (!row) throw new ApiError('NOT_FOUND', 'That change was not found.', 404);
  const payload = JSON.parse(row.payload) as { name: string; arguments: Record<string, unknown> };

  const applied = await callGrokTool(payload.name, payload.arguments, voiceContext(actor));
  if (!applied.ok) {
    await prisma.voicePendingChange.update({
      where: { id: pendingId },
      data: { status: 'FAILED' },
    });
    throw new ApiError('PROPOSAL_LOCKED', applied.error, 409);
  }

  const saved = await prisma.voicePendingChange.update({
    where: { id: pendingId },
    data: { status: 'CONFIRMED', confirmedAt: new Date() },
  });
  return {
    ...presentPending(saved),
    saved: true,
    result: applied.data,
  };
}

export async function cancelPendingChange(actor: VoiceActor, rawArgs: Record<string, unknown>) {
  const pendingId = onlyPendingId(rawArgs);
  const row = await prisma.voicePendingChange.findFirst({
    where: { id: pendingId, userId: actor.userId, tenantId: actor.tenantId },
  });
  if (!row) throw new ApiError('NOT_FOUND', 'That change was not found.', 404);
  if (row.status === 'CONFIRMED') {
    throw new ApiError('ALREADY_CONFIRMED', 'That change is already saved.', 409);
  }
  const updated = await prisma.voicePendingChange.update({
    where: { id: row.id },
    data: { status: 'CANCELLED' },
  });
  return presentPending(updated);
}

export async function runVoiceTool(actor: VoiceActor, name: string, args: Record<string, unknown>) {
  if (name === 'confirm_pending_change') return confirmPendingChange(actor, args);
  if (name === 'cancel_pending_change') return cancelPendingChange(actor, args);
  if (PROPOSE_TO_TOOL[name]) return createPendingChange(actor, name, args);
  if (READ_TOOLS.has(name)) {
    const result = await callGrokTool(name, args, voiceContext(actor));
    if (!result.ok) throw new ApiError('TOOL_FAILED', result.error, 400);
    return result.data;
  }
  throw new ApiError(
    'UNKNOWN_TOOL',
    'That action is not available. Sending, signing, accepting, and deleting stay in Engage.',
    400
  );
}
