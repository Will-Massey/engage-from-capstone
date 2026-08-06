/**
 * GET/POST /api/comms/... — firm inbox + two-way mailbox routes.
 * Role gates (mutating endpoints exclude JUNIOR), pagination cursor round-trip,
 * thread ordering, and tenant-scoped attachment streaming.
 */
import express from 'express';
import request from 'supertest';

let currentRole = 'PARTNER';

jest.mock('../../middleware/auth.js', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const r = req as express.Request & { tenantId?: string; user?: unknown };
    r.tenantId = 't1';
    r.user = {
      id: 'u1',
      email: 'a@x.com',
      firstName: 'A',
      lastName: 'B',
      role: currentRole as any,
      tenantId: 't1',
    };
    next();
  },
  authorize:
    (...roles: string[]) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const role = (req as express.Request & { user?: { role?: string } }).user?.role;
      // Mirror hasFullAccess: ADMIN/MD always pass regardless of the list.
      if (role === 'ADMIN' || role === 'MD' || (role && roles.includes(role))) return next();
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } });
    },
}));

const emailLogFindMany = jest.fn();
const emailLogCount = jest.fn();
const activityLogFindMany = jest.fn();
const activityLogCount = jest.fn();
const clientFindMany = jest.fn();
const mailMessageFindFirst = jest.fn();
const jobFindFirst = jest.fn();

jest.mock('../../config/database.js', () => ({
  prisma: {
    emailLog: { findMany: (...a: unknown[]) => emailLogFindMany(...a), count: (...a: unknown[]) => emailLogCount(...a) },
    activityLog: { findMany: (...a: unknown[]) => activityLogFindMany(...a), count: (...a: unknown[]) => activityLogCount(...a) },
    client: { findMany: (...a: unknown[]) => clientFindMany(...a) },
    mailMessage: { findFirst: (...a: unknown[]) => mailMessageFindFirst(...a) },
    job: { findFirst: (...a: unknown[]) => jobFindFirst(...a) },
    jobActivity: { create: jest.fn() },
  },
}));

const getMailboxConnection = jest.fn();
const listMailboxMessages = jest.fn();
const getThread = jest.fn();
const syncMailbox = jest.fn();
const sendMailboxMessage = jest.fn();
const markMailboxRead = jest.fn();
const linkMessageClient = jest.fn();
const getMailboxUnreadCount = jest.fn();
const getMessageContext = jest.fn();
const fetchMailAttachment = jest.fn();

jest.mock('../../services/mailboxService.js', () => ({
  getMailboxConnection: (...a: unknown[]) => getMailboxConnection(...a),
  listMailboxMessages: (...a: unknown[]) => listMailboxMessages(...a),
  getThread: (...a: unknown[]) => getThread(...a),
  syncMailbox: (...a: unknown[]) => syncMailbox(...a),
  sendMailboxMessage: (...a: unknown[]) => sendMailboxMessage(...a),
  markMailboxRead: (...a: unknown[]) => markMailboxRead(...a),
  linkMessageClient: (...a: unknown[]) => linkMessageClient(...a),
  getMailboxUnreadCount: (...a: unknown[]) => getMailboxUnreadCount(...a),
  getMessageContext: (...a: unknown[]) => getMessageContext(...a),
  fetchMailAttachment: (...a: unknown[]) => fetchMailAttachment(...a),
}));

jest.mock('../../config/sentry.js', () => ({
  captureException: jest.fn(),
  initSentry: jest.fn(),
  Sentry: {},
}));

import commsRoutes from '../comms.js';
import { errorHandler } from '../../middleware/errorHandler.js';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/comms', commsRoutes);
  a.use(errorHandler);
  return a;
}

function mailMessageDto(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    provider: 'GMAIL',
    direction: 'inbound',
    from: 'client@acme.com',
    to: 'firm@acme.com',
    cc: null,
    subject: 'Hello',
    body: 'Body',
    bodyHtml: null,
    at: '2026-08-01T10:00:00.000Z',
    read: false,
    hasAttachments: false,
    clientId: null,
    clientName: null,
    conversationId: 'conv-1',
    externalId: 'ext-1',
    attachments: [],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  currentRole = 'PARTNER';
  emailLogFindMany.mockResolvedValue([]);
  emailLogCount.mockResolvedValue(0);
  activityLogFindMany.mockResolvedValue([]);
  activityLogCount.mockResolvedValue(0);
  clientFindMany.mockResolvedValue([]);
  getMailboxConnection.mockResolvedValue({
    provider: 'GMAIL',
    user: 'firm@acme.com',
    health: { lastSyncAt: null, lastSyncOk: null, lastSyncError: null },
  });
  getMailboxUnreadCount.mockResolvedValue(0);
});

describe('role gates', () => {
  const MUTATING_ROUTES: [string, string, object][] = [
    ['post', '/mailbox/sync', {}],
    ['post', '/mailbox/send', { to: 'a@b.com', subject: 'S', body: 'B' }],
    ['post', '/mailbox/messages/m1/read', {}],
    ['post', '/mailbox/messages/m1/link-client', { clientId: '11111111-1111-1111-1111-111111111111' }],
    ['post', '/mailbox/messages/m1/create-task', {}],
    ['post', '/mailbox/messages/m1/assign-form', { templateId: 'tpl1' }],
  ];

  it.each(MUTATING_ROUTES)('excludes JUNIOR from %s %s', async (method, path) => {
    currentRole = 'JUNIOR';
    const res = await (request(app()) as any)[method](`/api/comms${path}`).send(
      MUTATING_ROUTES.find(([, p]) => p === path)?.[2] || {}
    );
    expect(res.status).toBe(403);
  });

  it('allows JUNIOR on read endpoints', async () => {
    currentRole = 'JUNIOR';
    listMailboxMessages.mockResolvedValue({ messages: [], nextCursor: null });
    const res = await request(app()).get('/api/comms/mailbox/messages');
    expect(res.status).toBe(200);
  });

  it('allows JUNIOR on attachment download', async () => {
    currentRole = 'JUNIOR';
    fetchMailAttachment.mockResolvedValue({
      name: 'invoice.pdf',
      contentType: 'application/pdf',
      content: Buffer.from('bytes'),
    });
    const res = await request(app()).get('/api/comms/mailbox/messages/m1/attachments/a1');
    expect(res.status).toBe(200);
  });

  it('allows SENIOR on mutating routes', async () => {
    currentRole = 'SENIOR';
    syncMailbox.mockResolvedValue({ imported: 0, updated: 0, ok: true });
    const res = await request(app()).post('/api/comms/mailbox/sync');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/comms/mailbox/messages — pagination', () => {
  it('caps limit at 100 and passes cursor through to the service', async () => {
    listMailboxMessages.mockResolvedValue({ messages: [mailMessageDto()], nextCursor: 'm1' });

    const res = await request(app()).get(
      '/api/comms/mailbox/messages?limit=500&cursor=prev-cursor&q=hi&unread=true'
    );

    expect(res.status).toBe(200);
    expect(res.body.data.nextCursor).toBe('m1');
    expect(res.body.data.messages).toHaveLength(1);
    expect(listMailboxMessages).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ limit: 100, cursor: 'prev-cursor', q: 'hi', unread: true })
    );
  });

  it('round-trips the returned nextCursor as the next request cursor', async () => {
    listMailboxMessages.mockResolvedValueOnce({ messages: [mailMessageDto({ id: 'm1' })], nextCursor: 'm1' });
    const first = await request(app()).get('/api/comms/mailbox/messages?limit=1');
    expect(first.body.data.nextCursor).toBe('m1');

    listMailboxMessages.mockResolvedValueOnce({ messages: [mailMessageDto({ id: 'm2' })], nextCursor: null });
    const second = await request(app()).get(
      `/api/comms/mailbox/messages?limit=1&cursor=${first.body.data.nextCursor}`
    );
    expect(second.status).toBe(200);
    expect(second.body.data.nextCursor).toBeNull();
    expect(listMailboxMessages).toHaveBeenLastCalledWith(
      't1',
      expect.objectContaining({ cursor: 'm1' })
    );
  });

  it('defaults limit to 50 when not provided', async () => {
    listMailboxMessages.mockResolvedValue({ messages: [], nextCursor: null });
    await request(app()).get('/api/comms/mailbox/messages');
    expect(listMailboxMessages).toHaveBeenCalledWith('t1', expect.objectContaining({ limit: 50 }));
  });

  it('returns 400 (not 500) when the cursor is garbage or stale', async () => {
    listMailboxMessages.mockRejectedValue(new Error('INVALID_CURSOR'));

    const res = await request(app()).get('/api/comms/mailbox/messages?cursor=not-a-real-id');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/comms/mailbox/messages/:id/thread', () => {
  it('returns the conversation ordered asc (as given by the service)', async () => {
    const older = mailMessageDto({ id: 'm1', at: '2026-08-01T09:00:00.000Z' });
    const newer = mailMessageDto({ id: 'm2', at: '2026-08-01T10:00:00.000Z' });
    getThread.mockResolvedValue([older, newer]);

    const res = await request(app()).get('/api/comms/mailbox/messages/m1/thread');

    expect(res.status).toBe(200);
    expect(res.body.data.messages.map((m: { id: string }) => m.id)).toEqual(['m1', 'm2']);
    expect(getThread).toHaveBeenCalledWith('t1', 'm1');
  });

  it('404s when the message does not exist for this tenant', async () => {
    getThread.mockResolvedValue([]);
    const res = await request(app()).get('/api/comms/mailbox/messages/missing/thread');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/comms/mailbox/messages/:id/attachments/:attachmentId', () => {
  it('streams bytes with a sanitised Content-Disposition filename', async () => {
    fetchMailAttachment.mockResolvedValue({
      name: 'faktúra.pdf',
      contentType: 'application/pdf',
      content: Buffer.from([0x25, 0x50, 0x44, 0x46]),
    });

    const res = await request(app()).get('/api/comms/mailbox/messages/m1/attachments/a1');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment;');
    expect(res.headers['content-disposition']).not.toMatch(/[^\x00-\x7F]/);
    expect(fetchMailAttachment).toHaveBeenCalledWith('t1', 'm1', 'a1');
  });

  it('404s cross-tenant / missing attachment', async () => {
    fetchMailAttachment.mockResolvedValue(null);
    const res = await request(app()).get('/api/comms/mailbox/messages/m1/attachments/a1');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/comms/mailbox/send', () => {
  it('validates the body via zod and forwards cc + replyToMessageId', async () => {
    sendMailboxMessage.mockResolvedValue({ dto: mailMessageDto({ direction: 'outbound' }), sent: true });

    const res = await request(app()).post('/api/comms/mailbox/send').send({
      to: 'client@acme.com',
      cc: 'partner@firm.com',
      subject: 'Re: Hi',
      body: 'Reply body',
      replyToMessageId: '11111111-1111-1111-1111-111111111111',
    });

    expect(res.status).toBe(200);
    expect(sendMailboxMessage).toHaveBeenCalledWith(
      't1',
      'u1',
      expect.objectContaining({
        to: 'client@acme.com',
        cc: 'partner@firm.com',
        replyToMessageId: '11111111-1111-1111-1111-111111111111',
      })
    );
  });

  it('rejects an invalid body', async () => {
    const res = await request(app()).post('/api/comms/mailbox/send').send({ to: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(sendMailboxMessage).not.toHaveBeenCalled();
  });

  it('F1: reports success with "Message sent" and sent:true when the provider send succeeds', async () => {
    sendMailboxMessage.mockResolvedValue({ dto: mailMessageDto({ direction: 'outbound' }), sent: true });

    const res = await request(app()).post('/api/comms/mailbox/send').send({
      to: 'client@acme.com',
      subject: 'Hi',
      body: 'Body',
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Message sent');
    expect(res.body.data.sent).toBe(true);
  });

  it('F1: does NOT report success when the provider send failed — surfaces sent:false and the deferred message', async () => {
    sendMailboxMessage.mockResolvedValue({
      dto: mailMessageDto({ direction: 'outbound' }),
      sent: false,
      error: 'Graph sendMail failed: 503 Service Unavailable',
    });

    const res = await request(app()).post('/api/comms/mailbox/send').send({
      to: 'client@acme.com',
      subject: 'Hi',
      body: 'Body',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sent).toBe(false);
    expect(res.body.message).toBe('Send deferred: Graph sendMail failed: 503 Service Unavailable');
  });
});

describe('POST /api/comms/mailbox/messages/:id/read', () => {
  it('defaults read to true when omitted', async () => {
    markMailboxRead.mockResolvedValue(undefined);
    const res = await request(app()).post('/api/comms/mailbox/messages/m1/read').send({});
    expect(res.status).toBe(200);
    expect(markMailboxRead).toHaveBeenCalledWith('t1', 'm1', true);
  });

  it('passes an explicit read:false through', async () => {
    markMailboxRead.mockResolvedValue(undefined);
    const res = await request(app())
      .post('/api/comms/mailbox/messages/m1/read')
      .send({ read: false });
    expect(res.status).toBe(200);
    expect(markMailboxRead).toHaveBeenCalledWith('t1', 'm1', false);
  });

  it('404s when the message is not found', async () => {
    markMailboxRead.mockRejectedValue(new Error('MESSAGE_NOT_FOUND'));
    const res = await request(app()).post('/api/comms/mailbox/messages/missing/read').send({});
    expect(res.status).toBe(404);
  });
});

describe('GET /api/comms/mailbox/connection', () => {
  it('includes health from the service', async () => {
    getMailboxConnection.mockResolvedValue({
      provider: 'GMAIL',
      user: 'firm@acme.com',
      health: { lastSyncAt: '2026-08-01T09:00:00.000Z', lastSyncOk: true, lastSyncError: null },
    });
    const res = await request(app()).get('/api/comms/mailbox/connection');
    expect(res.status).toBe(200);
    expect(res.body.data.health).toEqual({
      lastSyncAt: '2026-08-01T09:00:00.000Z',
      lastSyncOk: true,
      lastSyncError: null,
    });
  });
});

describe('GET /api/comms/mailbox/messages/:id/context', () => {
  it('returns the service context shape the frontend consumes', async () => {
    getMessageContext.mockResolvedValue({
      message: mailMessageDto(),
      client: { id: 'c1', name: 'Acme Ltd', contactName: 'Ada', contactEmail: 'ada@acme.com', portalToken: null, portalEnabled: true },
      jobs: [],
      pendingForms: [],
    });
    const res = await request(app()).get('/api/comms/mailbox/messages/m1/context');
    expect(res.status).toBe(200);
    expect(res.body.data.client.name).toBe('Acme Ltd');
    expect(res.body.data.jobs).toEqual([]);
    expect(res.body.data.pendingForms).toEqual([]);
  });

  it('404s when the message is not found', async () => {
    getMessageContext.mockResolvedValue({ message: null, client: null, jobs: [], pendingForms: [] });
    const res = await request(app()).get('/api/comms/mailbox/messages/missing/context');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/comms/mailbox/messages/:id/create-task', () => {
  it('404s when the message is not found (direct DB lookup, no 150-row scan)', async () => {
    mailMessageFindFirst.mockResolvedValue(null);
    const res = await request(app()).post('/api/comms/mailbox/messages/missing/create-task').send({});
    expect(res.status).toBe(404);
    expect(listMailboxMessages).not.toHaveBeenCalled();
  });

  it('400s when no client is linked', async () => {
    mailMessageFindFirst.mockResolvedValue({ id: 'm1', subject: 'Hello', clientId: null });
    const res = await request(app()).post('/api/comms/mailbox/messages/m1/create-task').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/comms/mailbox/messages/:id/assign-form', () => {
  it('404s when the message is not found (direct DB lookup, no 150-row scan)', async () => {
    mailMessageFindFirst.mockResolvedValue(null);
    const res = await request(app())
      .post('/api/comms/mailbox/messages/missing/assign-form')
      .send({ templateId: 'tpl1' });
    expect(res.status).toBe(404);
    expect(listMailboxMessages).not.toHaveBeenCalled();
  });
});
