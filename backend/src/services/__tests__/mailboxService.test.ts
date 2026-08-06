/**
 * Two-way mailbox storage + orchestration: upsert idempotency, auto client-link,
 * cursor pagination, unread count, send-with-reply threading, unconnected fallback,
 * and the dev-only seeding guard.
 */
const prismaMock = {
  client: { findFirst: jest.fn(), findMany: jest.fn() },
  job: { findMany: jest.fn() },
  mailMessage: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  mailboxSyncState: { findUnique: jest.fn(), upsert: jest.fn() },
  mailAttachment: { deleteMany: jest.fn(), createMany: jest.fn() },
};

jest.mock('../../config/database.js', () => ({ prisma: prismaMock }));

const loadTenantEmailContextMock = jest.fn();
jest.mock('../tenantEmailSettings.js', () => ({
  loadTenantEmailContext: (...args: unknown[]) => loadTenantEmailContextMock(...args),
}));

const createGraphMailClientMock = jest.fn();
jest.mock('../mail/graphMailClient.js', () => ({
  createGraphMailClient: (...args: unknown[]) => createGraphMailClientMock(...args),
}));

const createGmailMailClientMock = jest.fn();
jest.mock('../mail/gmailMailClient.js', () => ({
  createGmailMailClient: (...args: unknown[]) => createGmailMailClientMock(...args),
}));

const tenantMailerSendMock = jest.fn();
jest.mock('../tenantMailer.js', () => ({
  tenantMailerSend: (...args: unknown[]) => tenantMailerSendMock(...args),
}));

import {
  syncMailbox,
  listMailboxMessages,
  getThread,
  getMailboxUnreadCount,
  sendMailboxMessage,
  seedDevInboundIfEmpty,
  getMailboxConnection,
} from '../mailboxService.js';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

function mailMessageRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'm1',
    provider: 'GMAIL',
    externalId: 'ext-1',
    conversationId: 'conv-1',
    internetMessageId: '<a@b>',
    direction: 'INBOUND',
    fromAddress: 'client@acme.com',
    toAddresses: 'practice@firm.com',
    ccAddresses: null,
    subject: 'Hello',
    bodyText: 'Body',
    bodyHtml: null,
    isRead: false,
    hasAttachments: false,
    receivedAt: new Date('2026-08-01T10:00:00Z'),
    clientId: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NODE_ENV = 'test';
  prismaMock.client.findMany.mockResolvedValue([]);
  prismaMock.mailboxSyncState.findUnique.mockResolvedValue(null);
  prismaMock.mailboxSyncState.upsert.mockResolvedValue({});
  prismaMock.mailAttachment.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.mailAttachment.createMany.mockResolvedValue({ count: 0 });
});

afterAll(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe('syncMailbox — provider connected', () => {
  it('upserts by (tenantId, provider, externalId) idempotently: repeat sync updates rather than duplicates', async () => {
    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Firm',
      email: { provider: 'gmail', gmail: { user: 'firm@gmail.com', refreshToken: 'r1' } },
    });
    const syncInbox = jest.fn().mockResolvedValue({
      messages: [
        {
          externalId: 'gm-1',
          conversationId: 'thread-1',
          direction: 'INBOUND',
          from: 'client@acme.com',
          to: 'firm@gmail.com',
          subject: 'Hi',
          bodyText: 'Body text',
          isRead: false,
          hasAttachments: false,
          receivedAt: new Date('2026-08-01T10:00:00Z'),
        },
      ],
      deltaLink: 'history:100',
    });
    const syncSent = jest.fn().mockResolvedValue({ messages: [], deltaLink: 'history:100' });
    createGmailMailClientMock.mockResolvedValue({ syncInbox, syncSent });

    // First sync: message doesn't exist yet → created
    prismaMock.mailMessage.findUnique.mockResolvedValueOnce(null);
    prismaMock.client.findFirst.mockResolvedValue(null);
    prismaMock.mailMessage.create.mockResolvedValue({});

    const first = await syncMailbox('t1');
    expect(first.imported).toBe(1);
    expect(first.updated).toBe(0);
    expect(first.ok).toBe(true);
    expect(prismaMock.mailMessage.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.mailMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 't1', provider: 'GMAIL', externalId: 'gm-1' }),
      })
    );

    // Second sync: same externalId now exists → updated, not duplicated
    jest.clearAllMocks();
    prismaMock.client.findMany.mockResolvedValue([]);
    prismaMock.mailboxSyncState.findUnique.mockResolvedValue(null);
    prismaMock.mailboxSyncState.upsert.mockResolvedValue({});
    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Firm',
      email: { provider: 'gmail', gmail: { user: 'firm@gmail.com', refreshToken: 'r1' } },
    });
    createGmailMailClientMock.mockResolvedValue({ syncInbox, syncSent });
    prismaMock.mailMessage.findUnique.mockResolvedValueOnce({ id: 'existing-1', clientId: null });
    prismaMock.mailMessage.update.mockResolvedValue({});

    const second = await syncMailbox('t1');
    expect(second.imported).toBe(0);
    expect(second.updated).toBe(1);
    expect(prismaMock.mailMessage.create).not.toHaveBeenCalled();
    expect(prismaMock.mailMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'existing-1' } })
    );
  });

  it('auto-links clientId by matching the counterparty address against Client.contactEmail (case-insensitive)', async () => {
    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Firm',
      email: { provider: 'gmail', gmail: { user: 'firm@gmail.com', refreshToken: 'r1' } },
    });
    const syncInbox = jest.fn().mockResolvedValue({
      messages: [
        {
          externalId: 'gm-2',
          conversationId: 'thread-2',
          direction: 'INBOUND',
          from: 'Ada Lovelace <ADA@ACME.COM>',
          to: 'firm@gmail.com',
          subject: 'Records',
          bodyText: 'See attached',
          isRead: false,
          hasAttachments: false,
          receivedAt: new Date('2026-08-01T11:00:00Z'),
        },
      ],
      deltaLink: null,
    });
    const syncSent = jest.fn().mockResolvedValue({ messages: [], deltaLink: null });
    createGmailMailClientMock.mockResolvedValue({ syncInbox, syncSent });

    prismaMock.mailMessage.findUnique.mockResolvedValue(null);
    prismaMock.client.findFirst.mockResolvedValue({ id: 'c1', name: 'Acme Ltd' });
    prismaMock.mailMessage.create.mockResolvedValue({});

    await syncMailbox('t1');

    expect(prismaMock.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          contactEmail: { equals: 'ada@acme.com', mode: 'insensitive' },
        }),
      })
    );
    expect(prismaMock.mailMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clientId: 'c1' }) })
    );
  });

  it('persists MailAttachment rows on first sync, and reconciles (not duplicates) on re-sync', async () => {
    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Firm',
      email: { provider: 'gmail', gmail: { user: 'firm@gmail.com', refreshToken: 'r1' } },
    });
    const providerMessage = {
      externalId: 'gm-att-1',
      conversationId: 'thread-att',
      direction: 'INBOUND',
      from: 'client@acme.com',
      to: 'firm@gmail.com',
      subject: 'Invoice attached',
      bodyText: 'See attached',
      isRead: false,
      hasAttachments: true,
      receivedAt: new Date('2026-08-01T10:00:00Z'),
      attachments: [
        {
          externalId: 'att-1',
          name: 'invoice.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1234,
          isInline: false,
        },
      ],
    };
    const syncInbox = jest.fn().mockResolvedValue({ messages: [providerMessage], deltaLink: null });
    const syncSent = jest.fn().mockResolvedValue({ messages: [], deltaLink: null });
    createGmailMailClientMock.mockResolvedValue({ syncInbox, syncSent });

    // First sync: message is new → created, attachments created (no prior delete needed)
    prismaMock.mailMessage.findUnique.mockResolvedValueOnce(null);
    prismaMock.client.findFirst.mockResolvedValue(null);
    prismaMock.mailMessage.create.mockResolvedValue({ id: 'msg-att-1' });

    await syncMailbox('t1');

    expect(prismaMock.mailAttachment.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.mailAttachment.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.mailAttachment.createMany).toHaveBeenCalledWith({
      data: [
        {
          messageId: 'msg-att-1',
          externalId: 'att-1',
          name: 'invoice.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1234,
          isInline: false,
        },
      ],
    });

    // Re-sync: message already exists → update path must reconcile, not duplicate
    jest.clearAllMocks();
    prismaMock.client.findMany.mockResolvedValue([]);
    prismaMock.mailboxSyncState.findUnique.mockResolvedValue(null);
    prismaMock.mailboxSyncState.upsert.mockResolvedValue({});
    prismaMock.mailAttachment.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.mailAttachment.createMany.mockResolvedValue({ count: 1 });
    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Firm',
      email: { provider: 'gmail', gmail: { user: 'firm@gmail.com', refreshToken: 'r1' } },
    });
    createGmailMailClientMock.mockResolvedValue({ syncInbox, syncSent });
    prismaMock.mailMessage.findUnique.mockResolvedValueOnce({ id: 'msg-att-1', clientId: null });
    prismaMock.mailMessage.update.mockResolvedValue({});

    await syncMailbox('t1');

    expect(prismaMock.mailAttachment.deleteMany).toHaveBeenCalledWith({
      where: { messageId: 'msg-att-1' },
    });
    // exactly one createMany call with exactly one row — not accumulated across syncs
    expect(prismaMock.mailAttachment.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.mailAttachment.createMany).toHaveBeenCalledWith({
      data: [
        {
          messageId: 'msg-att-1',
          externalId: 'att-1',
          name: 'invoice.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1234,
          isInline: false,
        },
      ],
    });
  });
});

describe('syncMailbox — no provider connected', () => {
  it('returns NOT_CONNECTED and does not attempt any provider sync', async () => {
    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Firm',
      email: {},
    });
    prismaMock.mailMessage.count.mockResolvedValue(0);
    prismaMock.client.findMany.mockResolvedValue([]);

    const result = await syncMailbox('t1');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('NOT_CONNECTED');
    expect(createGmailMailClientMock).not.toHaveBeenCalled();
    expect(createGraphMailClientMock).not.toHaveBeenCalled();
  });

  it('seeds dev inbound messages in non-production when the mailbox is empty', async () => {
    process.env.NODE_ENV = 'development';
    loadTenantEmailContextMock.mockResolvedValue({ tenantId: 't1', tenantName: 'Firm', email: {} });
    prismaMock.mailMessage.count.mockResolvedValue(0);
    prismaMock.client.findMany.mockResolvedValue([
      { id: 'c1', name: 'Acme Ltd', contactEmail: 'ada@acme.com', contactName: 'Ada' },
    ]);
    prismaMock.mailMessage.create.mockResolvedValue({});

    const result = await syncMailbox('t1');

    expect(result.imported).toBe(1);
    expect(result.ok).toBe(false); // still not "connected" — just seeded for local dev usability
    expect(prismaMock.mailMessage.create).toHaveBeenCalledTimes(1);
  });
});

describe('seedDevInboundIfEmpty — production guard', () => {
  it('never seeds when NODE_ENV=production, even if the mailbox is empty', async () => {
    process.env.NODE_ENV = 'production';
    prismaMock.mailMessage.count.mockResolvedValue(0);

    const seeded = await seedDevInboundIfEmpty('t1');

    expect(seeded).toBe(0);
    expect(prismaMock.mailMessage.count).not.toHaveBeenCalled();
    expect(prismaMock.mailMessage.create).not.toHaveBeenCalled();
  });

  it('is a no-op once the tenant already has mail', async () => {
    process.env.NODE_ENV = 'development';
    prismaMock.mailMessage.count.mockResolvedValue(3);

    const seeded = await seedDevInboundIfEmpty('t1');

    expect(seeded).toBe(0);
    expect(prismaMock.mailMessage.create).not.toHaveBeenCalled();
  });
});

describe('listMailboxMessages', () => {
  it('paginates by (receivedAt, id) cursor, returning nextCursor only when more rows remain', async () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
      mailMessageRow({ id: `m${i}`, receivedAt: new Date(2026, 7, 3 - i) })
    );
    prismaMock.mailMessage.findMany.mockResolvedValue(rows); // limit(2)+1 = 3 returned → hasMore

    const page = await listMailboxMessages('t1', { limit: 2 });

    expect(page.messages).toHaveLength(2);
    expect(page.messages.map((m) => m.id)).toEqual(['m0', 'm1']);
    expect(page.nextCursor).toBe('m1');
    expect(prismaMock.mailMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
        take: 3,
      })
    );
  });

  it('returns nextCursor: null on the last page', async () => {
    prismaMock.mailMessage.findMany.mockResolvedValue([mailMessageRow({ id: 'm0' })]);

    const page = await listMailboxMessages('t1', { limit: 5 });

    expect(page.nextCursor).toBeNull();
    expect(page.messages).toHaveLength(1);
  });

  it('passes the cursor id through to Prisma with skip:1', async () => {
    prismaMock.mailMessage.findMany.mockResolvedValue([]);

    await listMailboxMessages('t1', { limit: 5, cursor: 'm1' });

    expect(prismaMock.mailMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: 'm1' }, skip: 1 })
    );
  });

  it('includes attachments on each message DTO', async () => {
    const row = mailMessageRow({
      id: 'm1',
      hasAttachments: true,
      attachments: [
        {
          id: 'a1',
          externalId: 'att-1',
          name: 'invoice.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1234,
          isInline: false,
        },
      ],
    });
    prismaMock.mailMessage.findMany.mockResolvedValue([row]);

    const page = await listMailboxMessages('t1', { limit: 5 });

    expect(page.messages[0].attachments).toEqual([
      {
        id: 'a1',
        externalId: 'att-1',
        name: 'invoice.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1234,
        isInline: false,
      },
    ]);
    expect(prismaMock.mailMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { attachments: true } })
    );
  });
});

describe('getThread', () => {
  it('includes attachments on each message DTO in the thread', async () => {
    prismaMock.mailMessage.findFirst.mockResolvedValueOnce({ conversationId: 'conv-1' });
    const row = mailMessageRow({
      id: 'm1',
      conversationId: 'conv-1',
      attachments: [
        {
          id: 'a1',
          externalId: 'att-1',
          name: 'x.pdf',
          contentType: 'application/pdf',
          sizeBytes: 10,
          isInline: false,
        },
      ],
    });
    prismaMock.mailMessage.findMany.mockResolvedValue([row]);

    const thread = await getThread('t1', 'm1');

    expect(thread).toHaveLength(1);
    expect(thread[0].attachments).toHaveLength(1);
    expect(prismaMock.mailMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { attachments: true } })
    );
  });
});

describe('getMailboxUnreadCount', () => {
  it('counts unread inbound messages via an indexed DB count, not a row scan', async () => {
    prismaMock.mailMessage.count.mockResolvedValue(7);

    const count = await getMailboxUnreadCount('t1');

    expect(count).toBe(7);
    expect(prismaMock.mailMessage.count).toHaveBeenCalledWith({
      where: { tenantId: 't1', direction: 'INBOUND', isRead: false },
    });
  });
});

describe('sendMailboxMessage — provider connected, with reply threading', () => {
  it('threads via the replied message externalId/internetMessageId/conversationId and inserts an OUTBOUND row', async () => {
    prismaMock.mailMessage.findFirst.mockResolvedValueOnce({
      externalId: 'orig-ext-1',
      internetMessageId: '<orig@firm.com>',
      conversationId: 'conv-orig',
      clientId: 'c1',
    });
    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Firm',
      email: { provider: 'outlook', fromEmail: 'firm@outlook.com', outlook: { user: 'firm@outlook.com', refreshToken: 'r1' } },
    });
    const send = jest.fn().mockResolvedValue({ externalId: null }); // Graph 202 → no body
    createGraphMailClientMock.mockResolvedValue({ send });
    prismaMock.mailMessage.create.mockResolvedValue(
      mailMessageRow({
        id: 'out-1',
        direction: 'OUTBOUND',
        conversationId: 'conv-orig',
        clientId: 'c1',
        subject: 'Re: Hi',
      })
    );
    prismaMock.client.findMany.mockResolvedValue([{ id: 'c1', name: 'Acme Ltd' }]);

    const dto = await sendMailboxMessage('t1', 'user-1', {
      to: 'client@acme.com',
      subject: 'Re: Hi',
      body: 'Reply body',
      replyToMessageId: 'orig-msg-id',
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        replyToExternalId: 'orig-ext-1',
        inReplyToInternetMessageId: '<orig@firm.com>',
      })
    );
    expect(prismaMock.mailMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: 'conv-orig',
          direction: 'OUTBOUND',
          clientId: 'c1',
        }),
      })
    );
    // Graph returned externalId: null → service must generate a local uuid instead of storing null
    const createdData = prismaMock.mailMessage.create.mock.calls[0][0].data;
    expect(createdData.externalId).toEqual(expect.any(String));
    expect(createdData.externalId.length).toBeGreaterThan(0);
    expect(dto.id).toBe('out-1');
  });
});

describe('sendMailboxMessage — no provider connected (fallback)', () => {
  it('falls back to tenantMailerSend and still inserts the OUTBOUND row', async () => {
    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Firm',
      email: {},
    });
    prismaMock.client.findFirst.mockResolvedValue(null);
    tenantMailerSendMock.mockResolvedValue({ success: true, messageId: 'sg-1' });
    prismaMock.mailMessage.create.mockResolvedValue(mailMessageRow({ id: 'out-2', direction: 'OUTBOUND' }));
    prismaMock.client.findMany.mockResolvedValue([]);

    const dto = await sendMailboxMessage('t1', null, {
      to: 'client@acme.com',
      subject: 'Hello',
      body: 'New thread',
    });

    expect(tenantMailerSendMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', messageType: 'OTHER' })
    );
    expect(prismaMock.mailMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ provider: 'SMTP', direction: 'OUTBOUND' }),
      })
    );
    expect(dto.id).toBe('out-2');
    // brand-new local send (no reply) → conversationId is a fresh local:<uuid>
    const createdData = prismaMock.mailMessage.create.mock.calls[0][0].data;
    expect(createdData.conversationId).toMatch(/^local:/);
  });

  it('still inserts the OUTBOUND row even when tenantMailerSend fails', async () => {
    loadTenantEmailContextMock.mockResolvedValue({ tenantId: 't1', tenantName: 'Firm', email: {} });
    prismaMock.client.findFirst.mockResolvedValue(null);
    tenantMailerSendMock.mockResolvedValue({ success: false, error: 'suppressed' });
    prismaMock.mailMessage.create.mockResolvedValue(mailMessageRow({ id: 'out-3', direction: 'OUTBOUND' }));
    prismaMock.client.findMany.mockResolvedValue([]);

    const dto = await sendMailboxMessage('t1', null, {
      to: 'client@acme.com',
      subject: 'Hello',
      body: 'New thread',
    });

    expect(prismaMock.mailMessage.create).toHaveBeenCalledTimes(1);
    expect(dto.id).toBe('out-3');
  });
});

describe('getMailboxConnection', () => {
  it('reports the normalised provider + user from settings.email, and health from MailboxSyncState', async () => {
    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Firm',
      email: { provider: 'gmail', gmail: { user: 'firm@gmail.com', refreshToken: 'r1' } },
    });
    prismaMock.mailboxSyncState.findUnique.mockResolvedValue({
      lastSyncAt: new Date('2026-08-01T09:00:00Z'),
      lastSyncOk: true,
      lastSyncError: null,
    });

    const conn = await getMailboxConnection('t1');

    expect(conn.provider).toBe('GMAIL');
    expect(conn.user).toBe('firm@gmail.com');
    expect(conn.health.lastSyncOk).toBe(true);
    expect(conn.health.lastSyncAt).toBe('2026-08-01T09:00:00.000Z');
  });

  it('reports no provider when settings.email has no usable credentials', async () => {
    loadTenantEmailContextMock.mockResolvedValue({ tenantId: 't1', tenantName: 'Firm', email: {} });
    prismaMock.mailboxSyncState.findUnique.mockResolvedValue(null);

    const conn = await getMailboxConnection('t1');

    expect(conn.provider).toBeNull();
    expect(conn.user).toBeNull();
    expect(conn.health).toEqual({ lastSyncAt: null, lastSyncOk: null, lastSyncError: null });
  });
});
