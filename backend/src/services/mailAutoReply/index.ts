/**
 * Orchestrator for the AI mailbox autoreply feature. Ties together the
 * eligibility gate (Task 2), the prompt builder (Task 3), and the AI client /
 * mailbox send path to turn a qualifying inbound message into a draft, and —
 * only in auto mode, and only once four send guards all pass — an actual
 * sent reply.
 *
 * `processNewInboundMessages` is invoked fire-and-forget from the mailbox
 * sync, so it must never reject: every message is processed in its own
 * try/catch, and a generation failure is recorded as a 'failed' draft rather
 * than allowed to propagate.
 */
import { prisma } from '../../config/database.js';
import { ApiError } from '../../middleware/errorHandler.js';
import {
  parseMailAutoReplySettings,
  isAutomatedSender,
  isWithinBusinessHours,
  containsMoneyFigure,
} from './eligibility.js';
import {
  buildAutoReplyMessages,
  type AutoReplyContext,
  type AutoReplyThreadMessage,
} from './prompt.js';
import { chatCompletion, checkAiTokenBudget } from '../ai/aiClient.js';
import { sendMailboxMessage } from '../mailboxService.js';

export const AI_REPLY_CONVERSATION_COOLDOWN_MS = 4 * 60 * 60 * 1000;
export const AI_REPLY_TENANT_DAILY_CAP = 20;

const CONTEXT_LIST_LIMIT = 5;

export type MailAiReplyDraftDto = {
  id: string;
  conversationId: string;
  inboundMessageId: string;
  subject: string;
  bodyText: string;
  status: string;
  createdAt: string;
};

function replySubject(subject: string): string {
  const trimmed = (subject || '').trim();
  return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

/** Builds the AI context for one inbound message — every read is tenant-scoped. */
async function buildContext(
  tenantId: string,
  tenantName: string | undefined,
  inbound: {
    id: string;
    conversationId: string | null;
    clientId: string | null;
  }
): Promise<AutoReplyContext> {
  const clientId = inbound.clientId as string;

  const [client, jobs, proposals, documentRequests, threadRows] = await Promise.all([
    prisma.client.findFirst({ where: { id: clientId, tenantId } }),
    prisma.job.findMany({
      where: { tenantId, clientId, isActive: true, boardColumn: { not: 'COMPLETE' } },
      take: CONTEXT_LIST_LIMIT,
    }),
    prisma.proposal.findMany({
      where: { tenantId, clientId, status: { in: ['SENT', 'VIEWED'] } },
      take: CONTEXT_LIST_LIMIT,
    }),
    prisma.documentRequest.findMany({
      where: { tenantId, clientId, status: 'OPEN' },
      take: CONTEXT_LIST_LIMIT,
    }),
    prisma.mailMessage.findMany({
      where: { tenantId, conversationId: inbound.conversationId },
      orderBy: { receivedAt: 'asc' },
      take: 20,
    }),
  ]);

  const thread: AutoReplyThreadMessage[] = threadRows.map((m: any) => ({
    direction: m.direction === 'INBOUND' ? 'inbound' : 'outbound',
    from: m.fromAddress,
    at: new Date(m.receivedAt).toISOString(),
    body: m.bodyText || '',
  }));

  return {
    practiceName: tenantName || '',
    clientName: client?.name ?? null,
    clientContactName: client?.contactName ?? null,
    openJobs: jobs.map((j: any) => j.title),
    openProposals: proposals.map((p: any) => p.title),
    outstandingRequests: documentRequests.map((d: any) => d.title),
    thread,
  };
}

/**
 * Auto-send guards, checked in order. Returns the name of the first guard
 * that failed, or null when all four pass and the draft is safe to send.
 */
async function findFailingGuard(
  tenantId: string,
  conversationId: string,
  generatedBody: string,
  businessHoursOnly: boolean
): Promise<string | null> {
  const recentSent = await prisma.mailAiReplyDraft.findFirst({
    where: {
      tenantId,
      conversationId,
      status: 'sent',
      decidedAt: { gte: new Date(Date.now() - AI_REPLY_CONVERSATION_COOLDOWN_MS) },
    },
  });
  if (recentSent) return 'conversation-cooldown';

  const sentToday = await prisma.mailAiReplyDraft.count({
    where: {
      tenantId,
      status: 'sent',
      decidedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });
  if (sentToday >= AI_REPLY_TENANT_DAILY_CAP) return 'tenant-daily-cap';

  if (containsMoneyFigure(generatedBody)) return 'money-figure';

  if (businessHoursOnly && !isWithinBusinessHours(new Date())) return 'business-hours';

  return null;
}

/** Processes a batch of inbound message ids. Never rejects. */
export async function processNewInboundMessages(
  tenantId: string,
  messageIds: string[]
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const settings = parseMailAutoReplySettings(tenant?.settings);
  if (!settings.enabled) return;

  for (const messageId of messageIds) {
    try {
      await processOneMessage(tenantId, tenant?.name, settings, messageId);
    } catch (err: any) {
      // Should not happen — processOneMessage handles its own generation
      // failures — but guarantee the fire-and-forget contract regardless.
      try {
        await prisma.mailAiReplyDraft.create({
          data: {
            tenantId,
            inboundMessageId: messageId,
            conversationId: '',
            clientId: null,
            subject: '',
            bodyText: '',
            status: 'failed',
            error: err?.message || String(err),
          },
        });
      } catch {
        /* best-effort — never let logging the failure break the loop */
      }
    }
  }
}

async function processOneMessage(
  tenantId: string,
  tenantName: string | undefined,
  settings: { enabled: boolean; mode: 'draft' | 'auto'; businessHoursOnly: boolean },
  messageId: string
): Promise<void> {
  const inbound = await prisma.mailMessage.findFirst({ where: { id: messageId, tenantId } });
  if (!inbound) return;
  if (inbound.direction !== 'INBOUND' || !inbound.clientId) return;
  if (isAutomatedSender(inbound.fromAddress, inbound.subject)) return;

  const existing = await prisma.mailAiReplyDraft.findUnique({
    where: { inboundMessageId: messageId },
  });
  if (existing) return;

  const budget = await checkAiTokenBudget(tenantId);
  if (!budget.withinBudget) return;

  const subject = replySubject(inbound.subject);

  let generatedBody: string;
  let usage: unknown;
  try {
    const ctx = await buildContext(tenantId, tenantName, inbound);
    const messages = buildAutoReplyMessages(ctx);
    const result = await chatCompletion(messages, { temperature: 0.4, maxTokens: 900 });
    generatedBody = (result.content || '').trim();
    usage = result.usage;
  } catch (err: any) {
    await prisma.mailAiReplyDraft.create({
      data: {
        tenantId,
        inboundMessageId: messageId,
        conversationId: inbound.conversationId || '',
        clientId: inbound.clientId,
        subject,
        bodyText: '',
        status: 'failed',
        error: err?.message || String(err),
      },
    });
    return;
  }

  // Always land a pending draft first — a human always has something to
  // review, whether or not auto-send goes on to fire.
  const draft = await prisma.mailAiReplyDraft.create({
    data: {
      tenantId,
      inboundMessageId: messageId,
      conversationId: inbound.conversationId || '',
      clientId: inbound.clientId,
      subject,
      bodyText: generatedBody,
      status: 'pending',
      generationMeta: JSON.stringify({ usage }),
    },
  });

  if (settings.mode !== 'auto') return;

  const failingGuard = await findFailingGuard(
    tenantId,
    inbound.conversationId || '',
    generatedBody,
    settings.businessHoursOnly
  );
  if (failingGuard) {
    await prisma.mailAiReplyDraft.update({
      where: { id: draft.id },
      data: { generationMeta: JSON.stringify({ usage, heldBy: failingGuard }) },
    });
    return;
  }

  const sendResult = await sendMailboxMessage(tenantId, null, {
    to: inbound.fromAddress,
    subject,
    body: generatedBody,
    replyToMessageId: inbound.id,
  });

  if (sendResult.sent) {
    await prisma.mailAiReplyDraft.update({
      where: { id: draft.id },
      data: {
        status: 'sent',
        sentMessageId: sendResult.dto.id,
        decidedAt: new Date(),
      },
    });
  } else {
    await prisma.mailAiReplyDraft.update({
      where: { id: draft.id },
      data: { generationMeta: JSON.stringify({ usage, sendError: sendResult.error }) },
    });
  }
}

function toDto(row: {
  id: string;
  conversationId: string;
  inboundMessageId: string;
  subject: string;
  bodyText: string;
  status: string;
  createdAt: Date;
}): MailAiReplyDraftDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    inboundMessageId: row.inboundMessageId,
    subject: row.subject,
    bodyText: row.bodyText,
    status: row.status,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

export async function listPendingDrafts(
  tenantId: string,
  conversationId?: string
): Promise<MailAiReplyDraftDto[]> {
  const rows = await prisma.mailAiReplyDraft.findMany({
    where: {
      tenantId,
      status: 'pending',
      ...(conversationId ? { conversationId } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toDto);
}

async function loadOwnedPendingDraft(tenantId: string, draftId: string) {
  const draft = await prisma.mailAiReplyDraft.findFirst({ where: { id: draftId, tenantId } });
  if (!draft) {
    throw new ApiError('DRAFT_NOT_FOUND', 'Draft not found', 404);
  }
  if (draft.status !== 'pending') {
    throw new ApiError('DRAFT_ALREADY_DECIDED', 'Draft has already been decided', 409);
  }
  return draft;
}

export async function approveDraft(
  tenantId: string,
  draftId: string,
  userId: string,
  bodyOverride?: string
): Promise<{ sent: boolean; error?: string }> {
  const draft = await loadOwnedPendingDraft(tenantId, draftId);
  const body = bodyOverride ?? draft.bodyText;

  const inbound = await prisma.mailMessage.findFirst({
    where: { id: draft.inboundMessageId, tenantId },
  });
  if (!inbound) {
    throw new ApiError('DRAFT_NOT_FOUND', 'Draft not found', 404);
  }

  const sendResult = await sendMailboxMessage(tenantId, userId, {
    to: inbound.fromAddress,
    subject: draft.subject,
    body,
    replyToMessageId: draft.inboundMessageId,
  });

  await prisma.mailAiReplyDraft.update({
    where: { id: draft.id },
    data: {
      status: sendResult.sent ? 'sent' : 'pending',
      bodyText: body,
      sentMessageId: sendResult.sent ? sendResult.dto.id : undefined,
      decidedAt: sendResult.sent ? new Date() : undefined,
      decidedByUserId: sendResult.sent ? userId : undefined,
      error: sendResult.sent ? undefined : sendResult.error,
    },
  });

  return { sent: sendResult.sent, error: sendResult.error };
}

export async function dismissDraft(
  tenantId: string,
  draftId: string,
  userId: string
): Promise<void> {
  const draft = await loadOwnedPendingDraft(tenantId, draftId);
  await prisma.mailAiReplyDraft.update({
    where: { id: draft.id },
    data: {
      status: 'dismissed',
      decidedAt: new Date(),
      decidedByUserId: userId,
    },
  });
}
