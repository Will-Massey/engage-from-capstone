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
import logger from '../../config/logger.js';
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
import {
  chatCompletion,
  checkAiTokenBudget,
  getAiModel,
  tokenMetaFromUsage,
  type AiTokenUsage,
} from '../ai/aiClient.js';
import { sendMailboxMessage } from '../mailboxService.js';

export const AI_REPLY_CONVERSATION_COOLDOWN_MS = 4 * 60 * 60 * 1000;
export const AI_REPLY_TENANT_DAILY_CAP = 20;
/** F5: a first sync or a provider switch can hand us months-old mail as
 * "newly created" rows — this bounds generation to genuinely fresh messages. */
export const AUTO_REPLY_MAX_MESSAGE_AGE_MS = 2 * 60 * 60 * 1000;
/** F5: caps how many messages one processNewInboundMessages call will
 * generate for, so a sync burst can never run away. */
export const AUTO_REPLY_MAX_BATCH_SIZE = 10;

const CONTEXT_LIST_LIMIT = 5;

export type MailAiReplyDraftDto = {
  id: string;
  conversationId: string;
  inboundMessageId: string;
  subject: string;
  bodyText: string;
  status: string;
  createdAt: string;
  /**
   * Which auto-send guard held this draft back, when one did. In auto mode a
   * held draft is indistinguishable from an ordinary draft without this, so
   * the practice cannot tell that the system deliberately asked for a human.
   * Null in draft mode, where every reply waits by design.
   */
  heldBy: string | null;
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
    direction: string;
    fromAddress: string;
    receivedAt: Date;
    bodyText: string | null;
  }
): Promise<AutoReplyContext> {
  const clientId = inbound.clientId as string;
  const conversationId = inbound.conversationId;

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
    // A null conversationId must not be used as a query value — it would
    // match every other message that also has no conversationId. Fall back
    // to just the inbound message itself as the thread in that case.
    conversationId
      ? prisma.mailMessage.findMany({
          where: { tenantId, conversationId },
          orderBy: { receivedAt: 'asc' },
          take: 20,
        })
      : Promise.resolve([inbound]),
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

/**
 * Records AI spend against the tenant's shared token budget, so
 * `checkAiTokenBudget` actually sees this feature's usage (mirrors
 * `logAiUsage`'s row shape in proposalAiService.ts — action, entityType and
 * metadata keys match exactly, so the accounting reads it the same way).
 * Never allowed to break generation: a logging failure is swallowed.
 */
async function logAutoReplyAiUsage(
  tenantId: string,
  messageId: string,
  usage: AiTokenUsage | undefined
): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        tenantId,
        userId: undefined,
        action: 'AI_FEATURE_USED',
        entityType: 'AI',
        description: 'mail_autoreply',
        metadata: JSON.stringify({ messageId, ...tokenMetaFromUsage(usage) }),
      },
    });
  } catch (err: any) {
    logger.warn('mailAutoReply: failed to log AI usage', {
      tenantId,
      messageId,
      error: err?.message || String(err),
    });
  }
}

/** Processes a batch of inbound message ids. Never rejects. */
export async function processNewInboundMessages(
  tenantId: string,
  messageIds: string[]
): Promise<void> {
  let tenant: { name?: string | null; settings?: string | null } | null;
  let settings: ReturnType<typeof parseMailAutoReplySettings>;
  try {
    tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    settings = parseMailAutoReplySettings(tenant?.settings);
  } catch (err: any) {
    // Pre-loop work is outside the per-message try/catch below — a transient
    // DB error here must not reject this fire-and-forget entry point.
    logger.error('mailAutoReply: failed to load tenant settings', {
      tenantId,
      error: err?.message || String(err),
    });
    return;
  }
  if (!settings.enabled) return;

  // The cap counts messages that actually reached the AI, not ids examined.
  // Slicing the id list first would let a backlog of stale mail (a first
  // connect hands over a 90-day window in arbitrary provider order) fill the
  // window and crowd out the one genuinely fresh message in it. The skips
  // ahead of generation are all cheap indexed reads.
  let generated = 0;
  for (const messageId of messageIds) {
    if (generated >= AUTO_REPLY_MAX_BATCH_SIZE) {
      logger.warn('mailAutoReply: batch capped, remaining messages skipped this run', {
        tenantId,
        received: messageIds.length,
        capped: AUTO_REPLY_MAX_BATCH_SIZE,
      });
      break;
    }
    try {
      const consumed = await processOneMessage(
        tenantId,
        tenant?.name ?? undefined,
        settings,
        messageId
      );
      if (consumed) generated++;
    } catch (err: any) {
      // Should not happen — processOneMessage handles its own generation
      // failures — but guarantee the fire-and-forget contract regardless.
      generated++;
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
  /** True when this message consumed a generation slot (the AI was called). */
): Promise<boolean> {
  const inbound = await prisma.mailMessage.findFirst({ where: { id: messageId, tenantId } });
  if (!inbound) return false;
  if (inbound.direction !== 'INBOUND' || !inbound.clientId) return false;
  if (isAutomatedSender(inbound.fromAddress, inbound.subject)) return false;
  // F5: a first sync or a provider switch hands us a "newly created" row for
  // mail that actually arrived long ago — a created-at row is not a
  // recently-arrived email, so age it off the message's own receivedAt.
  if (Date.now() - new Date(inbound.receivedAt).getTime() > AUTO_REPLY_MAX_MESSAGE_AGE_MS)
    return false;

  const existing = await prisma.mailAiReplyDraft.findUnique({
    where: { inboundMessageId: messageId },
  });
  if (existing) return false;

  const budget = await checkAiTokenBudget(tenantId);
  if (!budget.withinBudget) return false;

  const subject = replySubject(inbound.subject);

  let generatedBody: string;
  let usage: AiTokenUsage | undefined;
  let model: string;
  try {
    const ctx = await buildContext(tenantId, tenantName, inbound);
    const messages = buildAutoReplyMessages(ctx, new Date());
    const result = await chatCompletion(messages, { temperature: 0.4, maxTokens: 900 });
    generatedBody = (result.content || '').trim();
    usage = result.usage;
    model = getAiModel();
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
    return true;
  }

  // F3: the AI call above already spent tokens regardless of what happens to
  // the draft next (a lost P2002 race, a held auto-send guard, ...) — count
  // it against the budget now, not conditionally on the draft landing.
  await logAutoReplyAiUsage(tenantId, messageId, usage);

  // Always land a pending draft first — a human always has something to
  // review, whether or not auto-send goes on to fire.
  let draft;
  try {
    draft = await prisma.mailAiReplyDraft.create({
      data: {
        tenantId,
        inboundMessageId: messageId,
        conversationId: inbound.conversationId || '',
        clientId: inbound.clientId,
        subject,
        bodyText: generatedBody,
        status: 'pending',
        generationMeta: JSON.stringify({ model, usage }),
      },
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      // Another overlapping run already drafted this message first — the AI
      // spend already happened, but writing a 'failed' row here would be
      // wrong (this run didn't fail, it lost a race). Log and move on.
      logger.info('mailAutoReply: draft already created by a concurrent run', {
        tenantId,
        messageId,
      });
      return true;
    }
    throw err;
  }

  if (settings.mode !== 'auto') return true;

  const failingGuard = await findFailingGuard(
    tenantId,
    inbound.conversationId || '',
    generatedBody,
    settings.businessHoursOnly
  );
  if (failingGuard) {
    await prisma.mailAiReplyDraft.update({
      where: { id: draft.id },
      data: { generationMeta: JSON.stringify({ model, usage, heldBy: failingGuard }) },
    });
    return true;
  }

  // F1: claim the row before sending, mirroring approveDraft's atomic
  // pending -> sending claim, so a crash or throw here can never be mistaken
  // for "not sent" and re-drafted/re-sent by a later run.
  const claim = await prisma.mailAiReplyDraft.updateMany({
    where: { id: draft.id, tenantId, status: 'pending' },
    data: { status: 'sending' },
  });
  // Lost the claim to a concurrent run — it owns the send. The AI call above
  // still happened, so this message consumed a generation slot.
  if (claim.count === 0) return true;

  try {
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
      // Unambiguous failure — the provider never accepted it, so it is safe
      // to return the draft to 'pending' for a legitimate retry.
      await prisma.mailAiReplyDraft.update({
        where: { id: draft.id },
        data: {
          status: 'pending',
          generationMeta: JSON.stringify({ model, usage, sendError: sendResult.error }),
        },
      });
    }
  } catch (err: any) {
    // Ambiguous failure — sendMailboxMessage's provider send can succeed and
    // then still reject (its own local sent-message insert runs after the
    // provider accepted it), so we cannot tell whether the client already
    // got the email. Never put the draft back to 'pending' here — a retry
    // could send a genuine duplicate. Land it as 'failed' for a human to
    // inspect instead, same contract as approveDraft.
    await prisma.mailAiReplyDraft.update({
      where: { id: draft.id },
      data: { status: 'failed', error: err?.message || String(err) },
    });
  }
  return true;
}

/** Reads `heldBy` out of the stored generationMeta JSON, tolerating anything malformed. */
function heldByOf(generationMeta: string | null | undefined): string | null {
  if (!generationMeta) return null;
  try {
    const parsed = JSON.parse(generationMeta);
    return typeof parsed?.heldBy === 'string' ? parsed.heldBy : null;
  } catch {
    return null;
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
  generationMeta?: string | null;
}): MailAiReplyDraftDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    inboundMessageId: row.inboundMessageId,
    subject: row.subject,
    bodyText: row.bodyText,
    status: row.status,
    createdAt: new Date(row.createdAt).toISOString(),
    heldBy: heldByOf(row.generationMeta),
  };
}

/** F4: "off" must mean off — a stale browser tab must not be able to list or
 * send drafts once a tenant has switched the feature off, e.g. because a
 * draft said something wrong. */
async function isMailAutoReplyEnabled(tenantId: string): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  return parseMailAutoReplySettings(tenant?.settings).enabled;
}

export async function listPendingDrafts(
  tenantId: string,
  conversationId?: string
): Promise<MailAiReplyDraftDto[]> {
  if (!(await isMailAutoReplyEnabled(tenantId))) return [];

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

/**
 * A human must always be able to clear a draft that has not genuinely gone
 * out — including 'sending', which can otherwise be stranded forever if the
 * process dies between approveDraft's atomic claim and its follow-up update
 * (that interim state is only ever cleared inside the same function call, so
 * there is no other API path back out of it). Only a draft that truly sent
 * stays undismissable.
 */
async function loadOwnedDismissableDraft(tenantId: string, draftId: string) {
  const draft = await prisma.mailAiReplyDraft.findFirst({ where: { id: draftId, tenantId } });
  if (!draft) {
    throw new ApiError('DRAFT_NOT_FOUND', 'Draft not found', 404);
  }
  if (draft.status === 'sent') {
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
  // F4: a stale browser tab must not be able to send after the tenant has
  // flipped AI replies off.
  if (!(await isMailAutoReplyEnabled(tenantId))) {
    throw new ApiError(
      'MAIL_AUTOREPLY_DISABLED',
      'AI mailbox replies are turned off for this practice',
      409
    );
  }

  const draft = await prisma.mailAiReplyDraft.findFirst({ where: { id: draftId, tenantId } });
  if (!draft) {
    throw new ApiError('DRAFT_NOT_FOUND', 'Draft not found', 404);
  }

  // Atomic claim: only the caller whose conditional update actually flips a
  // row proceeds. Guards two near-simultaneous approvals that both pass a
  // plain read-then-write pending check.
  const claim = await prisma.mailAiReplyDraft.updateMany({
    where: { id: draftId, tenantId, status: 'pending' },
    data: { status: 'sending' },
  });
  if (claim.count === 0) {
    throw new ApiError('DRAFT_ALREADY_DECIDED', 'Draft has already been decided', 409);
  }

  const body = bodyOverride ?? draft.bodyText;

  try {
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
  } catch (err: any) {
    // A thrown error here is ambiguous: sendMailboxMessage's provider send
    // can succeed and then still reject (e.g. the local sent-message insert
    // fails afterwards), so we cannot tell whether the client already got
    // the email. Never put the draft back to 'pending' in that case — a
    // retry, human or auto, could send a genuine duplicate. Land it as
    // 'failed' with the error preserved for a human to inspect instead.
    await prisma.mailAiReplyDraft.update({
      where: { id: draft.id },
      data: { status: 'failed', error: err?.message || String(err) },
    });
    throw err;
  }
}

export async function dismissDraft(
  tenantId: string,
  draftId: string,
  userId: string
): Promise<void> {
  const draft = await loadOwnedDismissableDraft(tenantId, draftId);
  await prisma.mailAiReplyDraft.update({
    where: { id: draft.id },
    data: {
      status: 'dismissed',
      decidedAt: new Date(),
      decidedByUserId: userId,
    },
  });
}
