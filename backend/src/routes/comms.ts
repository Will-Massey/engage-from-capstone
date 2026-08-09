/**
 * Firm-wide communications inbox — EmailLog + portal messages + SMS activity.
 * Two-way mailbox: sync / compose / threads / attachments via mailboxService.
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { prisma } from '../config/database.js';
import {
  getMailboxConnection,
  listMailboxMessages,
  getThread,
  syncMailbox,
  sendMailboxMessage,
  markMailboxRead,
  linkMessageClient,
  getMailboxUnreadCount,
  getMessageContext,
  fetchMailAttachment,
} from '../services/mailboxService.js';
import { listPendingDrafts, approveDraft, dismissDraft } from '../services/mailAutoReply/index.js';

const router = Router();

/** Full six-role set — every practice role can read the mailbox. */
const MAILBOX_READ_ROLES = ['ADMIN', 'PARTNER', 'MD', 'MANAGER', 'SENIOR', 'JUNIOR'] as const;
/** Mutating mailbox actions (sync, send, link-client, create-task, assign-form) exclude JUNIOR. */
const MAILBOX_WRITE_ROLES = ['ADMIN', 'PARTNER', 'MD', 'MANAGER', 'SENIOR'] as const;

/** ASCII-safe filename for Content-Disposition (non-Latin-1 chars 500 the header). */
function asciiFilename(name: string, fallback: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/["\\]/g, '')
    .trim();
  return cleaned || fallback;
}

export type InboxItem = {
  id: string;
  channel: 'email' | 'sms' | 'portal' | 'system';
  title: string;
  detail: string;
  status: string | null;
  at: string;
  clientId: string | null;
  clientName: string | null;
  to: string | null;
  proposalId: string | null;
  href: string | null;
};

/**
 * GET /api/comms/inbox
 * Firm timeline: emails, SMS drafts, portal messages, @mention activity.
 */
router.get(
  '/inbox',
  authenticate,
  authorize(...MAILBOX_READ_ROLES),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const limit = Math.min(parseInt(String(req.query.limit || '80'), 10) || 80, 150);
    const q = String(req.query.q || '')
      .trim()
      .toLowerCase();
    const channel = String(req.query.channel || 'all'); // all | email | sms | portal
    const clientId = req.query.clientId as string | undefined;

    const items: InboxItem[] = [];

    if (channel === 'all' || channel === 'email') {
      const logs = await prisma.emailLog.findMany({
        where: {
          tenantId,
          ...(clientId ? { clientId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          messageType: true,
          status: true,
          to: true,
          subject: true,
          error: true,
          sentAt: true,
          createdAt: true,
          clientId: true,
          proposalId: true,
          client: { select: { id: true, name: true } },
        },
      });
      for (const log of logs) {
        items.push({
          id: `email:${log.id}`,
          channel: 'email',
          title: log.subject || log.messageType,
          detail: [log.to, log.error].filter(Boolean).join(' · '),
          status: log.status,
          at: (log.sentAt || log.createdAt).toISOString(),
          clientId: log.clientId,
          clientName: log.client?.name || null,
          to: log.to,
          proposalId: log.proposalId,
          href: log.clientId
            ? `/clients/${log.clientId}?tab=comms`
            : log.proposalId
              ? `/proposals/${log.proposalId}`
              : null,
        });
      }
    }

    if (channel === 'all' || channel === 'sms' || channel === 'portal') {
      const actions: string[] = [];
      if (channel === 'all' || channel === 'sms') actions.push('SMS_SENT', 'SMS_DRAFT');
      if (channel === 'all' || channel === 'portal') {
        actions.push('PORTAL_MESSAGE', 'PORTAL_TASK');
      }
      // Mentions always included in "all"
      if (channel === 'all') actions.push('MENTION', 'JOB_ACTIVITY');

      const activities = await prisma.activityLog.findMany({
        where: {
          tenantId,
          action: { in: actions },
          ...(clientId
            ? {
                OR: [
                  { entityType: 'CLIENT', entityId: clientId },
                  // metadata may carry clientId for job activities
                ],
              }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          action: true,
          description: true,
          metadata: true,
          entityType: true,
          entityId: true,
          createdAt: true,
        },
      });

      const clientIds = [
        ...new Set(
          activities
            .filter((a) => a.entityType === 'CLIENT' && a.entityId)
            .map((a) => a.entityId as string)
        ),
      ];
      const clients =
        clientIds.length > 0
          ? await prisma.client.findMany({
              where: { tenantId, id: { in: clientIds } },
              select: { id: true, name: true },
            })
          : [];
      const clientMap = new Map(clients.map((c) => [c.id, c.name]));

      for (const act of activities) {
        let meta: Record<string, unknown> = {};
        try {
          meta = JSON.parse(act.metadata || '{}');
        } catch {
          /* ignore */
        }
        const cId =
          act.entityType === 'CLIENT' && act.entityId
            ? act.entityId
            : typeof meta.clientId === 'string'
              ? meta.clientId
              : null;
        if (clientId && cId && cId !== clientId) continue;

        const isPortal = act.action === 'PORTAL_MESSAGE' || act.action === 'PORTAL_TASK';
        const isSms = act.action === 'SMS_SENT' || act.action === 'SMS_DRAFT';
        items.push({
          id: `act:${act.id}`,
          channel: isPortal ? 'portal' : isSms ? 'sms' : 'system',
          title:
            act.action === 'PORTAL_TASK'
              ? `Task: ${act.description || 'Portal task'}`
              : act.action === 'PORTAL_MESSAGE'
                ? 'Portal message'
                : act.description || act.action,
          detail:
            act.action === 'PORTAL_MESSAGE'
              ? (act.description || '').slice(0, 200)
              : act.action === 'PORTAL_TASK'
                ? meta.done === true
                  ? 'Completed'
                  : 'Open'
                : String(meta.detail || meta.to || ''),
          status: isSms
            ? act.action === 'SMS_SENT'
              ? 'SENT'
              : 'DRAFT'
            : isPortal
              ? meta.done === true
                ? 'DONE'
                : meta.from
                  ? String(meta.from)
                  : null
              : null,
          at: act.createdAt.toISOString(),
          clientId: cId,
          clientName: cId ? clientMap.get(cId) || null : null,
          to: typeof meta.to === 'string' ? meta.to : null,
          proposalId: null,
          href: cId ? `/clients/${cId}?tab=comms` : null,
        });
      }
    }

    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    let filtered = items.slice(0, limit);
    if (q) {
      filtered = filtered.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.detail.toLowerCase().includes(q) ||
          (i.clientName || '').toLowerCase().includes(q) ||
          (i.to || '').toLowerCase().includes(q)
      );
    }

    // Summary counts (unfiltered channel mix, last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [emailWeek, portalWeek] = await Promise.all([
      prisma.emailLog.count({
        where: { tenantId, createdAt: { gte: weekAgo } },
      }),
      prisma.activityLog.count({
        where: {
          tenantId,
          action: { in: ['PORTAL_MESSAGE', 'PORTAL_TASK'] },
          createdAt: { gte: weekAgo },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        items: filtered,
        summary: {
          emailLast7d: emailWeek,
          portalLast7d: portalWeek,
          shown: filtered.length,
        },
      },
    });
  })
);

/**
 * GET /api/comms/stats — lightweight badge counts for nav.
 */
router.get(
  '/stats',
  authenticate,
  authorize(...MAILBOX_READ_ROLES),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [emails, portal, mailboxUnread] = await Promise.all([
      prisma.emailLog.count({ where: { tenantId, createdAt: { gte: dayAgo } } }),
      prisma.activityLog.count({
        where: {
          tenantId,
          action: { in: ['PORTAL_MESSAGE', 'PORTAL_TASK'] },
          createdAt: { gte: dayAgo },
        },
      }),
      getMailboxUnreadCount(tenantId),
    ]);
    res.json({
      success: true,
      data: { last24h: emails + portal + mailboxUnread, emails, portal, mailboxUnread },
    });
  })
);

// ==================== TWO-WAY MAILBOX ====================

router.get(
  '/mailbox/connection',
  authenticate,
  authorize(...MAILBOX_READ_ROLES),
  asyncHandler(async (req, res) => {
    const connection = await getMailboxConnection(req.tenantId!);
    res.json({ success: true, data: connection });
  })
);

router.get(
  '/mailbox/messages',
  authenticate,
  authorize(...MAILBOX_READ_ROLES),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const unread = req.query.unread === 'true' || req.query.unread === '1';
    const clientId = req.query.clientId ? String(req.query.clientId) : undefined;
    const limitRaw = parseInt(String(req.query.limit || '50'), 10);
    const limit = Math.min(Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50, 100);
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined;

    let result: Awaited<ReturnType<typeof listMailboxMessages>>;
    try {
      result = await listMailboxMessages(req.tenantId!, {
        q: q || undefined,
        unread: unread || undefined,
        clientId,
        limit,
        cursor,
      });
    } catch (e: any) {
      if (e?.message === 'INVALID_CURSOR') {
        throw new ApiError('VALIDATION_ERROR', 'Invalid cursor', 400);
      }
      throw e;
    }
    const { messages, nextCursor } = result;
    res.json({
      success: true,
      data: { messages, nextCursor },
    });
  })
);

/**
 * GET /api/comms/mailbox/messages/:id/thread
 * Full conversation for a message, oldest first.
 */
router.get(
  '/mailbox/messages/:id/thread',
  authenticate,
  authorize(...MAILBOX_READ_ROLES),
  asyncHandler(async (req, res) => {
    const messages = await getThread(req.tenantId!, req.params.id);
    if (!messages.length) throw new ApiError('NOT_FOUND', 'Message not found', 404);
    res.json({ success: true, data: { messages } });
  })
);

/**
 * GET /api/comms/mailbox/messages/:id/attachments/:attachmentId
 * Stream a mailbox attachment from the provider. Tenant-scoped; 404s when
 * the message/attachment don't exist or belong to another tenant.
 */
router.get(
  '/mailbox/messages/:id/attachments/:attachmentId',
  authenticate,
  authorize(...MAILBOX_READ_ROLES),
  asyncHandler(async (req, res) => {
    const attachment = await fetchMailAttachment(
      req.tenantId!,
      req.params.id,
      req.params.attachmentId
    );
    if (!attachment) throw new ApiError('NOT_FOUND', 'Attachment not found', 404);

    res.setHeader('Content-Type', attachment.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFilename(attachment.name, 'attachment')}"`
    );
    res.send(attachment.content);
  })
);

router.post(
  '/mailbox/sync',
  authenticate,
  authorize(...MAILBOX_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const result = await syncMailbox(req.tenantId!);
    let message: string;
    if (result.error === 'NOT_CONNECTED') {
      message =
        result.imported > 0
          ? `Local mailbox ready — ${result.imported} client threads seeded (connect Gmail/M365 in Settings for live two-way sync)`
          : 'Mailbox not connected — connect Gmail or Microsoft 365 in Settings for live sync.';
    } else if (result.ok) {
      message = `Synced ${result.imported} new, ${result.updated} updated`;
    } else {
      message = `Sync failed: ${result.error}`;
    }
    res.json({ success: true, data: result, message });
  })
);

const sendMailboxSchema = z.object({
  to: z.string().email(),
  cc: z.string().email().optional(),
  subject: z.string().min(1),
  body: z.string().min(1),
  replyToMessageId: z.string().uuid().optional(),
});

router.post(
  '/mailbox/send',
  authenticate,
  authorize(...MAILBOX_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const body = sendMailboxSchema.parse(req.body);
    const { dto, sent, error } = await sendMailboxMessage(req.tenantId!, req.user?.id, body);
    res.json({
      success: true,
      data: { ...dto, sent },
      message: sent ? 'Message sent' : `Send deferred: ${error}`,
    });
  })
);

const readStateSchema = z.object({ read: z.boolean().optional() });

/** F4: marking a message read is a low-risk, non-outbound state change — the
 * mailbox equivalent of "I looked at this" — so JUNIOR is allowed here even
 * though every other mutating mailbox route excludes it. See
 * docs/MAILBOX_TWO_WAY.md's role table for the full rationale. */
router.post(
  '/mailbox/messages/:id/read',
  authenticate,
  authorize(...MAILBOX_READ_ROLES),
  asyncHandler(async (req, res) => {
    const body = readStateSchema.parse(req.body || {});
    try {
      await markMailboxRead(req.tenantId!, req.params.id, body.read ?? true);
    } catch (e: any) {
      if (e?.message === 'MESSAGE_NOT_FOUND')
        throw new ApiError('NOT_FOUND', 'Message not found', 404);
      throw e;
    }
    res.json({ success: true });
  })
);

/**
 * POST /api/comms/mailbox/messages/:id/link-client
 * Manually attach a message (+ same thread) to a client when auto-match missed.
 */
router.post(
  '/mailbox/messages/:id/link-client',
  authenticate,
  authorize(...MAILBOX_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const schema = z.object({ clientId: z.string().uuid() });
    const body = schema.parse(req.body);
    try {
      await linkMessageClient(req.tenantId!, req.params.id, body.clientId);
      res.json({ success: true, message: 'Linked message thread to client' });
    } catch (e: any) {
      if (e?.message === 'CLIENT_NOT_FOUND') {
        throw new ApiError('NOT_FOUND', 'Client not found', 404);
      }
      if (e?.message === 'MESSAGE_NOT_FOUND') {
        throw new ApiError('NOT_FOUND', 'Message not found', 404);
      }
      throw e;
    }
  })
);

/** GET /api/comms/mailbox/unread-count — nav badge */
router.get(
  '/mailbox/unread-count',
  authenticate,
  authorize(...MAILBOX_READ_ROLES),
  asyncHandler(async (req, res) => {
    const unread = await getMailboxUnreadCount(req.tenantId!);
    res.json({ success: true, data: { unread } });
  })
);

/**
 * GET /api/comms/mailbox/messages/:id/context
 * Graph context: matched client, open jobs, pending forms (for sidebar + actions).
 */
router.get(
  '/mailbox/messages/:id/context',
  authenticate,
  authorize(...MAILBOX_READ_ROLES),
  asyncHandler(async (req, res) => {
    const context = await getMessageContext(req.tenantId!, req.params.id);
    if (!context.message) throw new ApiError('NOT_FOUND', 'Message not found', 404);
    res.json({ success: true, data: context });
  })
);

/**
 * POST /api/comms/mailbox/messages/:id/create-task
 * Create a portal-visible client task from an email (or staff task note on first open job).
 */
router.post(
  '/mailbox/messages/:id/create-task',
  authenticate,
  authorize(...MAILBOX_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const schema = z.object({
      title: z.string().min(1).max(500).optional(),
      clientId: z.string().uuid().optional().nullable(),
    });
    const body = schema.parse(req.body || {});
    const msg = await prisma.mailMessage.findFirst({
      where: { id: req.params.id, tenantId },
      select: { id: true, subject: true, clientId: true },
    });
    if (!msg) throw new ApiError('NOT_FOUND', 'Message not found', 404);

    const clientId = body.clientId || msg.clientId;
    if (!clientId) {
      throw new ApiError('NO_CLIENT', 'Link this message to a client first', 400);
    }

    const { createPortalTask } = await import('../services/portalOsService.js');
    const user = req.user as { firstName?: string; lastName?: string; id?: string } | undefined;
    const authorName = user
      ? [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Staff'
      : 'Staff';
    const task = await createPortalTask({
      tenantId,
      clientId,
      title: body.title || `Follow up: ${msg.subject}`.slice(0, 200),
      from: 'staff',
      authorName,
      userId: user?.id || null,
    });

    // Also drop a note on the first open job if any
    const job = await prisma.job.findFirst({
      where: {
        tenantId,
        clientId,
        isActive: true,
        boardColumn: { not: 'COMPLETE' },
      },
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (job) {
      await prisma.jobActivity.create({
        data: {
          kind: 'NOTE',
          message: `Task from mailbox: ${task.title}`,
          jobId: job.id,
          actorId: user?.id,
          metadata: JSON.stringify({ mailboxMessageId: msg.id, portalTaskId: task.id }),
        },
      });
    }

    res.status(201).json({ success: true, data: { task, jobId: job?.id || null } });
  })
);

/**
 * POST /api/comms/mailbox/messages/:id/assign-form
 * Assign a form template to the matched client from the thread.
 */
router.post(
  '/mailbox/messages/:id/assign-form',
  authenticate,
  authorize(...MAILBOX_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const schema = z.object({
      templateId: z.string().min(1),
      clientId: z.string().uuid().optional().nullable(),
      dueInDays: z.number().int().min(1).max(90).optional().default(7),
    });
    const body = schema.parse(req.body);
    const msg = await prisma.mailMessage.findFirst({
      where: { id: req.params.id, tenantId },
      select: { id: true, clientId: true },
    });
    if (!msg) throw new ApiError('NOT_FOUND', 'Message not found', 404);
    const clientId = body.clientId || msg.clientId;
    if (!clientId) {
      throw new ApiError('NO_CLIENT', 'Link this message to a client first', 400);
    }
    const { assignFormBulk } = await import('../services/practiceFormsService.js');
    const result = await assignFormBulk({
      tenantId,
      templateId: body.templateId,
      clientIds: [clientId],
      userId: req.user?.id,
      dueInDays: body.dueInDays,
    });
    res.json({
      success: true,
      data: result,
      message: result.assigned
        ? 'Form assigned from mailbox'
        : 'Client already has this form pending',
    });
  })
);

// ==================== AI MAILBOX AUTOREPLY ====================

const aiDraftsQuerySchema = z.object({ conversationId: z.string().optional() });

/**
 * GET /api/comms/mailbox/ai-drafts
 * Pending AI-generated reply drafts awaiting human approve/dismiss.
 */
router.get(
  '/mailbox/ai-drafts',
  authenticate,
  authorize(...MAILBOX_READ_ROLES),
  asyncHandler(async (req, res) => {
    const { conversationId } = aiDraftsQuerySchema.parse(req.query);
    const drafts = await listPendingDrafts(req.tenantId!, conversationId);
    res.json({ success: true, data: { drafts } });
  })
);

/**
 * POST /api/comms/mailbox/ai-drafts/:id/approve
 * Send the draft (optionally with an edited body). Excludes JUNIOR — sends
 * real email to clients, same gate as every other outbound mailbox mutation.
 */
router.post(
  '/mailbox/ai-drafts/:id/approve',
  authenticate,
  authorize(...MAILBOX_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const body = z.object({ body: z.string().min(1).max(20000).optional() }).parse(req.body);
    const result = await approveDraft(req.tenantId!, req.params.id, req.user!.id, body.body);
    res.json({ success: true, data: result });
  })
);

/**
 * POST /api/comms/mailbox/ai-drafts/:id/dismiss
 * Reject the draft without sending. Excludes JUNIOR, matching approve.
 */
router.post(
  '/mailbox/ai-drafts/:id/dismiss',
  authenticate,
  authorize(...MAILBOX_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    await dismissDraft(req.tenantId!, req.params.id, req.user!.id);
    res.json({ success: true });
  })
);

export default router;
