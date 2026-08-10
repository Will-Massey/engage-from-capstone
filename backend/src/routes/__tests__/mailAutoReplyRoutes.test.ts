/**
 * AI mailbox autoreply HTTP surface — list/approve/dismiss on comms.ts, plus
 * the tenant settings whitelist that switches the feature on. Approve/dismiss
 * must exclude JUNIOR like every other outbound mailbox mutation; the
 * settings write must reject an invalid `mode` before it ever reaches Prisma.
 */
import express from 'express';
import request from 'supertest';

let currentRole: 'ADMIN' | 'MANAGER' | 'SENIOR' | 'JUNIOR' = 'ADMIN';

jest.mock('../../middleware/auth.js', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const r = req as express.Request & { tenantId?: string; user?: unknown };
    r.tenantId = 't1';
    r.user = {
      id: 'u1',
      email: 'a@x.com',
      firstName: 'A',
      lastName: 'B',
      role: currentRole,
      tenantId: 't1',
    };
    next();
  },
  authorize:
    (...roles: string[]) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const role = (req as express.Request & { user?: { role?: string } }).user?.role;
      if (role && roles.includes(role)) return next();
      res.status(403).json({ success: false, error: { message: 'Forbidden' } });
    },
}));

const listPendingDraftsMock = jest.fn();
const approveDraftMock = jest.fn();
const dismissDraftMock = jest.fn();

jest.mock('../../services/mailAutoReply/index.js', () => ({
  listPendingDrafts: (...a: unknown[]) => listPendingDraftsMock(...a),
  approveDraft: (...a: unknown[]) => approveDraftMock(...a),
  dismissDraft: (...a: unknown[]) => dismissDraftMock(...a),
}));

jest.mock('../../services/mailboxService.js', () => ({
  getMailboxConnection: jest.fn(),
  listMailboxMessages: jest.fn(),
  getThread: jest.fn(),
  syncMailbox: jest.fn(),
  sendMailboxMessage: jest.fn(),
  markMailboxRead: jest.fn(),
  linkMessageClient: jest.fn(),
  getMailboxUnreadCount: jest.fn(),
  getMessageContext: jest.fn(),
  fetchMailAttachment: jest.fn(),
}));

const tenantFindUnique = jest.fn();
const tenantUpdate = jest.fn();
const activityLogCreate = jest.fn();

jest.mock('../../config/database.js', () => ({
  prisma: {
    tenant: { findUnique: tenantFindUnique, update: tenantUpdate },
    activityLog: { create: activityLogCreate },
    emailLog: { findMany: jest.fn(), count: jest.fn() },
    client: { findMany: jest.fn() },
  },
}));

import commsRoutes from '../comms.js';
import settingsRoutes from '../tenants/settings.js';
import { errorHandler } from '../../middleware/errorHandler.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/comms', commsRoutes);
  app.use('/api/tenants', settingsRoutes);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  currentRole = 'ADMIN';
  listPendingDraftsMock.mockResolvedValue([]);
  approveDraftMock.mockResolvedValue({ sent: true });
  dismissDraftMock.mockResolvedValue(undefined);
  tenantFindUnique.mockResolvedValue({ settings: JSON.stringify({}) });
  tenantUpdate.mockResolvedValue({});
  activityLogCreate.mockResolvedValue({});
});

describe('GET /api/comms/mailbox/ai-drafts', () => {
  it('lists pending drafts for the tenant', async () => {
    const res = await request(makeApp()).get('/api/comms/mailbox/ai-drafts');
    expect(res.status).toBe(200);
    expect(res.body.data.drafts).toBeDefined();
    expect(listPendingDraftsMock).toHaveBeenCalledWith('t1', undefined);
  });

  it('passes through a plain string conversationId', async () => {
    const res = await request(makeApp()).get('/api/comms/mailbox/ai-drafts?conversationId=c1');
    expect(res.status).toBe(200);
    expect(listPendingDraftsMock).toHaveBeenCalledWith('t1', 'c1');
  });

  it('rejects a non-string conversationId (object injection via the extended query parser)', async () => {
    const res = await request(makeApp()).get(
      '/api/comms/mailbox/ai-drafts?conversationId[contains]=x'
    );
    expect(res.status).toBe(400);
    expect(listPendingDraftsMock).not.toHaveBeenCalled();
  });

  it('requires a recognised read role', async () => {
    currentRole = 'JUNIOR';
    const res = await request(makeApp()).get('/api/comms/mailbox/ai-drafts');
    // JUNIOR is a full mailbox reader, so this still succeeds — the point is
    // the route now runs through the same authorize() gate as every other
    // read route rather than skipping it entirely.
    expect(res.status).toBe(200);
  });
});

describe('POST /api/comms/mailbox/ai-drafts/:id/approve', () => {
  it('approves a draft and returns the send outcome', async () => {
    const res = await request(makeApp())
      .post('/api/comms/mailbox/ai-drafts/d1/approve')
      .send({ body: 'edited body' });
    expect(res.status).toBe(200);
    expect(approveDraftMock).toHaveBeenCalledWith('t1', 'd1', 'u1', 'edited body');
  });

  it('rejects a JUNIOR trying to approve', async () => {
    currentRole = 'JUNIOR';
    const res = await request(makeApp()).post('/api/comms/mailbox/ai-drafts/d1/approve').send({});
    expect(res.status).toBe(403);
  });
});

describe('POST /api/comms/mailbox/ai-drafts/:id/dismiss', () => {
  it('dismisses a draft', async () => {
    const res = await request(makeApp()).post('/api/comms/mailbox/ai-drafts/d1/dismiss').send({});
    expect(res.status).toBe(200);
    expect(dismissDraftMock).toHaveBeenCalledWith('t1', 'd1', 'u1');
  });
});

describe('PUT /api/tenants/settings (mailAutoReply)', () => {
  it('rejects an invalid mode with 400', async () => {
    const res = await request(makeApp())
      .put('/api/tenants/settings')
      .send({ mailAutoReply: { enabled: true, mode: 'always' } });
    expect(res.status).toBe(400);
    expect(tenantUpdate).not.toHaveBeenCalled();
  });

  it('accepts a valid mode, preserves other settings keys, and audit-logs the change', async () => {
    tenantFindUnique.mockResolvedValue({
      settings: JSON.stringify({ webhookUrl: 'https://example.com/hook' }),
    });
    const res = await request(makeApp())
      .put('/api/tenants/settings')
      .send({ mailAutoReply: { enabled: true, mode: 'draft' } });
    expect(res.status).toBe(200);
    const savedSettings = JSON.parse(tenantUpdate.mock.calls[0][0].data.settings);
    expect(savedSettings.webhookUrl).toBe('https://example.com/hook');
    expect(savedSettings.mailAutoReply).toEqual({ enabled: true, mode: 'draft' });
    expect(activityLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'MAIL_AUTOREPLY_SETTINGS_CHANGED' }),
      })
    );
  });

  it('rejects a MANAGER trying to change mailAutoReply', async () => {
    currentRole = 'MANAGER';
    const res = await request(makeApp())
      .put('/api/tenants/settings')
      .send({ mailAutoReply: { enabled: true, mode: 'draft' } });
    expect(res.status).toBe(403);
    expect(tenantUpdate).not.toHaveBeenCalled();
  });
});
