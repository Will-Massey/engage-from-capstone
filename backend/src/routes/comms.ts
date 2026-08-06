/**
 * Firm-wide communications inbox — EmailLog + portal messages + SMS activity.
 * Two-way mailbox: sync / compose / threads via mailboxService.
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { prisma } from '../config/database.js';
import {
  getMailboxConnection,
  listMailboxMessages,
  syncMailbox,
  sendMailboxMessage,
  markMailboxRead,
  linkMailboxMessageToClient,
  countUnreadMailbox,
} from '../services/mailboxService.js';

const router = Router();

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
      countUnreadMailbox(tenantId),
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
  asyncHandler(async (req, res) => {
    const connection = await getMailboxConnection(req.tenantId!);
    res.json({ success: true, data: connection });
  })
);

router.get(
  '/mailbox/messages',
  authenticate,
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(parseInt(String(req.query.limit || '80'), 10) || 80, 150);
    const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';
    const messages = await listMailboxMessages(req.tenantId!, { limit, q, unreadOnly });
    const connection = await getMailboxConnection(req.tenantId!);
    res.json({
      success: true,
      data: {
        messages,
        connection,
        unread: messages.filter((m) => m.direction === 'inbound' && !m.read).length,
      },
    });
  })
);

router.post(
  '/mailbox/sync',
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await syncMailbox(req.tenantId!);
    res.json({ success: true, data: result, message: result.message });
  })
);

router.post(
  '/mailbox/send',
  authenticate,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      to: z.string().email().or(z.string().min(3).max(320)),
      subject: z.string().min(1).max(500),
      body: z.string().min(1).max(20000),
      clientId: z.string().uuid().optional().nullable(),
      inReplyToId: z.string().uuid().optional().nullable(),
    });
    const body = schema.parse(req.body);
    const result = await sendMailboxMessage({
      tenantId: req.tenantId!,
      userId: req.user?.id,
      to: body.to,
      subject: body.subject,
      body: body.body,
      clientId: body.clientId,
      inReplyToId: body.inReplyToId,
    });
    if (!result.sent && result.error) {
      // Still created local history — return 200 with warning
      res.json({
        success: true,
        data: result,
        message: `Saved to mailbox (send deferred: ${result.error})`,
      });
      return;
    }
    res.json({
      success: true,
      data: result,
      message: result.sent ? 'Message sent' : 'Message saved',
    });
  })
);

router.post(
  '/mailbox/messages/:id/read',
  authenticate,
  asyncHandler(async (req, res) => {
    const ok = await markMailboxRead(req.tenantId!, req.params.id);
    if (!ok) throw new ApiError('NOT_FOUND', 'Message not found', 404);
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
  asyncHandler(async (req, res) => {
    const schema = z.object({ clientId: z.string().uuid() });
    const body = schema.parse(req.body);
    try {
      const result = await linkMailboxMessageToClient({
        tenantId: req.tenantId!,
        messageId: req.params.id,
        clientId: body.clientId,
      });
      res.json({
        success: true,
        data: result,
        message: `Linked ${result.updated} message(s) to ${result.clientName}`,
      });
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
  asyncHandler(async (req, res) => {
    const unread = await countUnreadMailbox(req.tenantId!);
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
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const messages = await listMailboxMessages(tenantId, { limit: 150 });
    const msg = messages.find((m) => m.id === req.params.id);
    if (!msg) throw new ApiError('NOT_FOUND', 'Message not found', 404);

    let clientId = msg.clientId;
    if (!clientId) {
      // try match from from/to email
      const addr = (msg.direction === 'inbound' ? msg.from : msg.to)
        .toLowerCase()
        .replace(/.*<|>.*/g, '')
        .trim();
      if (addr.includes('@')) {
        const c = await prisma.client.findFirst({
          where: {
            tenantId,
            contactEmail: { equals: addr, mode: 'insensitive' },
          },
          select: { id: true },
        });
        clientId = c?.id || null;
      }
    }

    const client = clientId
      ? await prisma.client.findFirst({
          where: { id: clientId, tenantId },
          select: {
            id: true,
            name: true,
            contactName: true,
            contactEmail: true,
            portalToken: true,
            portalEnabled: true,
          },
        })
      : null;

    const jobs = clientId
      ? await prisma.job.findMany({
          where: {
            tenantId,
            clientId,
            isActive: true,
            boardColumn: { not: 'COMPLETE' },
          },
          select: {
            id: true,
            reference: true,
            title: true,
            boardColumn: true,
            dueAt: true,
          },
          take: 8,
          orderBy: { updatedAt: 'desc' },
        })
      : [];

    const { listAssignments } = await import('../services/practiceFormsService.js');
    const forms = clientId
      ? (await listAssignments(tenantId, { clientId })).filter((f) => f.status === 'pending')
      : [];

    res.json({
      success: true,
      data: {
        message: msg,
        client,
        jobs,
        pendingForms: forms,
      },
    });
  })
);

/**
 * POST /api/comms/mailbox/messages/:id/create-task
 * Create a portal-visible client task from an email (or staff task note on first open job).
 */
router.post(
  '/mailbox/messages/:id/create-task',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const schema = z.object({
      title: z.string().min(1).max(500).optional(),
      clientId: z.string().uuid().optional().nullable(),
    });
    const body = schema.parse(req.body || {});
    const messages = await listMailboxMessages(tenantId, { limit: 150 });
    const msg = messages.find((m) => m.id === req.params.id);
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
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const schema = z.object({
      templateId: z.string().min(1),
      clientId: z.string().uuid().optional().nullable(),
      dueInDays: z.number().int().min(1).max(90).optional().default(7),
    });
    const body = schema.parse(req.body);
    const messages = await listMailboxMessages(tenantId, { limit: 150 });
    const msg = messages.find((m) => m.id === req.params.id);
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

export default router;
