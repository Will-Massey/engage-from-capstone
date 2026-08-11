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
  mailAttachment: { deleteMany: jest.fn(), createMany: jest.fn(), findFirst: jest.fn() },
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
  fetchMailAttachment,
  markMailboxRead,
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

/**
 * Regression: the first real Microsoft 365 sync in production died with
 *   Invalid `prisma.mailMessage.create()` invocation:
 *   unexpected end of hex escape at line 1 column 40429
 * Cause was ours, not the provider's. `bodyText.slice(0, 280)` cuts on UTF-16
 * code units, so a boundary landing inside a surrogate pair (any emoji) leaves
 * an unpaired high surrogate. Prisma's Rust engine cannot parse that, and the
 * throw aborts the WHOLE sync, not just the offending message — one emoji in
 * one email wedged the entire mailbox.
 */
const UNPAIRED_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe('syncMailbox — snippet truncation must never split a surrogate pair', () => {
  it('writes a well-formed snippet when the 280-char boundary lands inside an emoji', async () => {
    // Well-formed body. The 280th UTF-16 unit falls in the middle of the emoji.
    const body = `${'a'.repeat(279)}\u{1F600} and then some more text after it`;
    expect(UNPAIRED_SURROGATE.test(body)).toBe(false); // provider data is clean

    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Firm',
      email: { provider: 'gmail', gmail: { user: 'firm@gmail.com', refreshToken: 'r1' } },
    });
    const syncInbox = jest.fn().mockResolvedValue({
      messages: [
        {
          externalId: 'gm-emoji-1',
          conversationId: 'thread-emoji',
          direction: 'INBOUND',
          from: 'client@acme.com',
          to: 'firm@gmail.com',
          subject: 'Emoji at the cut point',
          bodyText: body,
          isRead: false,
          hasAttachments: false,
          receivedAt: new Date('2026-08-11T10:00:00Z'),
        },
      ],
      deltaLink: 'history:200',
    });
    createGmailMailClientMock.mockResolvedValue({
      syncInbox,
      syncSent: jest.fn().mockResolvedValue({ messages: [], deltaLink: 'history:200' }),
    });
    prismaMock.mailMessage.findUnique.mockResolvedValueOnce(null);
    prismaMock.client.findFirst.mockResolvedValue(null);
    prismaMock.mailMessage.create.mockResolvedValue({});

    const result = await syncMailbox('t1');

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(1);

    const { snippet } = prismaMock.mailMessage.create.mock.calls[0][0].data as {
      snippet: string;
    };
    // The actual invariant Prisma requires: no unpaired surrogate reaches the DB.
    expect(UNPAIRED_SURROGATE.test(snippet)).toBe(false);
    // And it is still a real truncation, not the whole body.
    expect(snippet.length).toBeLessThanOrEqual(280);
    expect(snippet.startsWith('aaa')).toBe(true);
  });
});

describe('syncMailbox — F2: reconciles a locally-created OUTBOUND send instead of duplicating', () => {
  it('updates the localsend: row externalId/conversationId/internetMessageId when the sentitems delta brings the real message back, instead of creating a duplicate', async () => {
    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Firm',
      email: { provider: 'outlook', outlook: { user: 'firm@outlook.com', refreshToken: 'r1' } },
    });
    const syncInbox = jest.fn().mockResolvedValue({ messages: [], deltaLink: null });
    const syncSent = jest.fn().mockResolvedValue({
      messages: [
        {
          externalId: 'graph-real-1',
          conversationId: 'conv-real',
          internetMessageId: '<real@firm.com>',
          direction: 'OUTBOUND',
          from: 'firm@outlook.com',
          to: 'Client <client@acme.com>',
          subject: 'Re: Hi',
          bodyText: 'Reply body',
          isRead: true,
          hasAttachments: false,
          receivedAt: new Date('2026-08-06T10:05:00Z'),
        },
      ],
      deltaLink: null,
    });
    createGraphMailClientMock.mockResolvedValue({ syncInbox, syncSent });

    // No row exists yet under the real provider externalId...
    prismaMock.mailMessage.findUnique.mockResolvedValueOnce(null);
    // ...but the row the app wrote at send-time (localsend: prefix, same
    // conversation, close receivedAt, same counterparty) is found instead.
    prismaMock.mailMessage.findMany.mockResolvedValueOnce([
      {
        id: 'local-out-1',
        conversationId: 'conv-real',
        subject: 'Re: Hi',
        toAddresses: 'client@acme.com',
      },
    ]);
    prismaMock.mailMessage.update.mockResolvedValue({});

    const result = await syncMailbox('t1');

    expect(result.imported).toBe(0);
    expect(result.updated).toBe(1);
    expect(prismaMock.mailMessage.create).not.toHaveBeenCalled();
    expect(prismaMock.mailMessage.update).toHaveBeenCalledWith({
      where: { id: 'local-out-1' },
      data: {
        externalId: 'graph-real-1',
        conversationId: 'conv-real',
        internetMessageId: '<real@firm.com>',
      },
    });
  });

  it('creates a new row when no locally-created send matches (different subject and conversation)', async () => {
    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Firm',
      email: { provider: 'outlook', outlook: { user: 'firm@outlook.com', refreshToken: 'r1' } },
    });
    const syncInbox = jest.fn().mockResolvedValue({ messages: [], deltaLink: null });
    const syncSent = jest.fn().mockResolvedValue({
      messages: [
        {
          externalId: 'graph-real-2',
          conversationId: 'conv-real-2',
          direction: 'OUTBOUND',
          from: 'firm@outlook.com',
          to: 'someone-else@acme.com',
          subject: 'Unrelated',
          bodyText: 'Body',
          isRead: true,
          hasAttachments: false,
          receivedAt: new Date('2026-08-06T10:05:00Z'),
        },
      ],
      deltaLink: null,
    });
    createGraphMailClientMock.mockResolvedValue({ syncInbox, syncSent });

    prismaMock.mailMessage.findUnique.mockResolvedValueOnce(null);
    prismaMock.mailMessage.findMany.mockResolvedValueOnce([
      {
        id: 'local-out-1',
        conversationId: 'conv-real',
        subject: 'Re: Hi',
        toAddresses: 'client@acme.com',
      },
    ]);
    prismaMock.client.findFirst.mockResolvedValue(null);
    prismaMock.mailMessage.create.mockResolvedValue({});

    const result = await syncMailbox('t1');

    expect(result.imported).toBe(1);
    expect(result.updated).toBe(0);
    expect(prismaMock.mailMessage.update).not.toHaveBeenCalled();
  });
});

describe('syncMailbox — F3: delta invalidation recovery', () => {
  it('nulls inboxDeltaLink/sentDeltaLink and records "delta reset" when the provider signals 410 (Graph resyncRequired)', async () => {
    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Firm',
      email: { provider: 'outlook', outlook: { user: 'firm@outlook.com', refreshToken: 'r1' } },
    });
    const deltaError = Object.assign(new Error('Graph delta fetch failed: 410 Gone'), {
      statusCode: 410,
    });
    const syncInbox = jest.fn().mockRejectedValue(deltaError);
    const syncSent = jest.fn().mockResolvedValue({ messages: [], deltaLink: 'old-sent-link' });
    createGraphMailClientMock.mockResolvedValue({ syncInbox, syncSent });
    prismaMock.mailboxSyncState.findUnique.mockResolvedValue({
      inboxDeltaLink: 'stale-inbox-link',
      sentDeltaLink: 'stale-sent-link',
    });

    const result = await syncMailbox('t1');

    expect(result.ok).toBe(false);
    expect(prismaMock.mailboxSyncState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 't1' },
        update: expect.objectContaining({
          inboxDeltaLink: null,
          sentDeltaLink: null,
          lastSyncOk: false,
          lastSyncError: expect.stringContaining('delta reset'),
        }),
      })
    );
  });

  it('nulls deltaLinks and records "delta reset" for a Gmail stale-historyId 404 too', async () => {
    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Firm',
      email: { provider: 'gmail', gmail: { user: 'firm@gmail.com', refreshToken: 'r1' } },
    });
    const historyError = Object.assign(new Error('Gmail history sync failed'), { statusCode: 404 });
    const syncInbox = jest.fn().mockRejectedValue(historyError);
    const syncSent = jest.fn().mockResolvedValue({ messages: [], deltaLink: 'history:999' });
    createGmailMailClientMock.mockResolvedValue({ syncInbox, syncSent });
    prismaMock.mailboxSyncState.findUnique.mockResolvedValue({
      inboxDeltaLink: 'history:100',
      sentDeltaLink: 'history:100',
    });

    const result = await syncMailbox('t1');

    expect(result.ok).toBe(false);
    expect(prismaMock.mailboxSyncState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          inboxDeltaLink: null,
          sentDeltaLink: null,
          lastSyncError: expect.stringContaining('delta reset'),
        }),
      })
    );
  });

  it('does not reset deltaLinks for a plain (non-410/404) sync failure', async () => {
    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Firm',
      email: { provider: 'gmail', gmail: { user: 'firm@gmail.com', refreshToken: 'r1' } },
    });
    const syncInbox = jest.fn().mockRejectedValue(new Error('network reset'));
    const syncSent = jest.fn().mockResolvedValue({ messages: [], deltaLink: 'history:999' });
    createGmailMailClientMock.mockResolvedValue({ syncInbox, syncSent });
    prismaMock.mailboxSyncState.findUnique.mockResolvedValue({
      inboxDeltaLink: 'history:100',
      sentDeltaLink: 'history:100',
    });

    await syncMailbox('t1');

    const upsertCall = prismaMock.mailboxSyncState.upsert.mock.calls[0][0];
    expect(upsertCall.update.inboxDeltaLink).toBeUndefined();
    expect(upsertCall.update.sentDeltaLink).toBeUndefined();
    expect(upsertCall.update.lastSyncError).toBe('network reset');
  });
});

describe('syncMailbox — F2: coalesces concurrent calls for the same tenant', () => {
  it('runs the provider sync once and resolves both concurrent callers with the same result', async () => {
    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Firm',
      email: { provider: 'gmail', gmail: { user: 'firm@gmail.com', refreshToken: 'r1' } },
    });
    let resolveSyncInbox: (v: unknown) => void = () => {};
    const syncInbox = jest.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveSyncInbox = resolve;
      })
    );
    const syncSent = jest.fn().mockResolvedValue({ messages: [], deltaLink: null });
    createGmailMailClientMock.mockResolvedValue({ syncInbox, syncSent });

    const first = syncMailbox('t1');
    const second = syncMailbox('t1');

    resolveSyncInbox({ messages: [], deltaLink: null });
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(createGmailMailClientMock).toHaveBeenCalledTimes(1);
    expect(syncInbox).toHaveBeenCalledTimes(1);
    expect(firstResult).toEqual(secondResult);
    expect(firstResult.ok).toBe(true);
  });

  it('starts a fresh sync for a later call once the in-flight one has settled', async () => {
    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Firm',
      email: { provider: 'gmail', gmail: { user: 'firm@gmail.com', refreshToken: 'r1' } },
    });
    const syncInbox = jest.fn().mockResolvedValue({ messages: [], deltaLink: null });
    const syncSent = jest.fn().mockResolvedValue({ messages: [], deltaLink: null });
    createGmailMailClientMock.mockResolvedValue({ syncInbox, syncSent });

    await syncMailbox('t1');
    await syncMailbox('t1');

    expect(createGmailMailClientMock).toHaveBeenCalledTimes(2);
  });
});

describe('syncMailbox — F2: a P2002 during upsert is treated as benign, not a sync failure', () => {
  it('re-reads and updates the row on a unique-constraint collision instead of throwing', async () => {
    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Firm',
      email: { provider: 'outlook', outlook: { user: 'firm@outlook.com', refreshToken: 'r1' } },
    });
    const syncInbox = jest.fn().mockResolvedValue({
      messages: [
        {
          externalId: 'graph-1',
          conversationId: 'conv-1',
          direction: 'INBOUND',
          from: 'client@acme.com',
          to: 'firm@outlook.com',
          subject: 'Hi',
          bodyText: 'Body',
          isRead: false,
          hasAttachments: false,
          receivedAt: new Date('2026-08-06T10:00:00Z'),
        },
      ],
      deltaLink: null,
    });
    const syncSent = jest.fn().mockResolvedValue({ messages: [], deltaLink: null });
    createGraphMailClientMock.mockResolvedValue({ syncInbox, syncSent });

    // No row yet under this externalId when we first check...
    prismaMock.mailMessage.findUnique.mockResolvedValueOnce(null);
    prismaMock.client.findFirst.mockResolvedValue(null);
    // ...but another concurrent sync run wins the race and creates it first.
    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    prismaMock.mailMessage.create.mockRejectedValueOnce(p2002);
    // Re-read after the collision finds the row the other run created.
    prismaMock.mailMessage.findUnique.mockResolvedValueOnce({ id: 'won-the-race', clientId: null });
    prismaMock.mailMessage.update.mockResolvedValue({});

    const result = await syncMailbox('t1');

    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(prismaMock.mailMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'won-the-race' } })
    );
    expect(prismaMock.mailboxSyncState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ lastSyncOk: true }) })
    );
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

  it('rejects with INVALID_CURSOR (not the raw Prisma error) when the cursor row does not exist', async () => {
    const p2025 = Object.assign(
      new Error(
        'An operation failed because it depends on one or more records that were required but not found.'
      ),
      { code: 'P2025', clientVersion: '5.0.0' }
    );
    prismaMock.mailMessage.findMany.mockRejectedValue(p2025);

    await expect(
      listMailboxMessages('t1', { limit: 5, cursor: 'garbage-or-stale-id' })
    ).rejects.toThrow('INVALID_CURSOR');
  });

  it('lets a P2025 with no cursor in play propagate unchanged (not misclassified as a cursor error)', async () => {
    const p2025 = Object.assign(new Error('unrelated not-found'), { code: 'P2025' });
    prismaMock.mailMessage.findMany.mockRejectedValue(p2025);

    await expect(listMailboxMessages('t1', { limit: 5 })).rejects.toThrow('unrelated not-found');
  });

  it('propagates non-cursor errors as-is', async () => {
    prismaMock.mailMessage.findMany.mockRejectedValue(new Error('connection reset'));

    await expect(listMailboxMessages('t1', { limit: 5, cursor: 'm1' })).rejects.toThrow(
      'connection reset'
    );
  });
});

describe('fetchMailAttachment', () => {
  it('resolves the message + attachment and fetches bytes from the provider by externalId', async () => {
    prismaMock.mailMessage.findFirst.mockResolvedValue({ id: 'm1', externalId: 'ext-msg-1' });
    prismaMock.mailAttachment.findFirst.mockResolvedValue({
      externalId: 'ext-att-1',
      name: 'invoice.pdf',
      contentType: 'application/pdf',
    });
    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Firm',
      email: { provider: 'gmail', gmail: { user: 'firm@gmail.com', refreshToken: 'r1' } },
    });
    const fetchAttachment = jest.fn().mockResolvedValue({
      name: 'invoice.pdf',
      contentType: 'application/pdf',
      content: Buffer.from('bytes'),
    });
    createGmailMailClientMock.mockResolvedValue({ fetchAttachment });

    const result = await fetchMailAttachment('t1', 'm1', 'a1');

    expect(prismaMock.mailMessage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm1', tenantId: 't1' } })
    );
    expect(prismaMock.mailAttachment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a1', messageId: 'm1' } })
    );
    expect(fetchAttachment).toHaveBeenCalledWith('ext-msg-1', 'ext-att-1');
    expect(result).toEqual({
      name: 'invoice.pdf',
      contentType: 'application/pdf',
      content: Buffer.from('bytes'),
    });
  });

  it('returns null when the message belongs to another tenant (or does not exist)', async () => {
    prismaMock.mailMessage.findFirst.mockResolvedValue(null);

    const result = await fetchMailAttachment('t1', 'cross-tenant-m1', 'a1');

    expect(result).toBeNull();
    expect(prismaMock.mailAttachment.findFirst).not.toHaveBeenCalled();
  });

  it('returns null when the attachmentId does not belong to the message', async () => {
    prismaMock.mailMessage.findFirst.mockResolvedValue({ id: 'm1', externalId: 'ext-msg-1' });
    prismaMock.mailAttachment.findFirst.mockResolvedValue(null);

    const result = await fetchMailAttachment('t1', 'm1', 'unknown-attachment');

    expect(result).toBeNull();
  });

  it('returns null when no mail provider is connected for the tenant', async () => {
    prismaMock.mailMessage.findFirst.mockResolvedValue({ id: 'm1', externalId: 'ext-msg-1' });
    prismaMock.mailAttachment.findFirst.mockResolvedValue({
      externalId: 'ext-att-1',
      name: 'invoice.pdf',
      contentType: 'application/pdf',
    });
    loadTenantEmailContextMock.mockResolvedValue({ tenantId: 't1', tenantName: 'Firm', email: {} });

    const result = await fetchMailAttachment('t1', 'm1', 'a1');

    expect(result).toBeNull();
    expect(createGmailMailClientMock).not.toHaveBeenCalled();
    expect(createGraphMailClientMock).not.toHaveBeenCalled();
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
      email: {
        provider: 'outlook',
        fromEmail: 'firm@outlook.com',
        outlook: { user: 'firm@outlook.com', refreshToken: 'r1' },
      },
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

    const result = await sendMailboxMessage('t1', 'user-1', {
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
    // Graph returned externalId: null → service must generate a local uuid instead of storing null,
    // tagged with the localsend: prefix so a later sentitems sync can reconcile it (F2).
    const createdData = prismaMock.mailMessage.create.mock.calls[0][0].data;
    expect(createdData.externalId).toEqual(expect.any(String));
    expect(createdData.externalId).toMatch(/^localsend:/);
    expect(result.dto.id).toBe('out-1');
    expect(result.sent).toBe(true);
    expect(result.error).toBeUndefined();
  });
});

describe('sendMailboxMessage — F1: honest send status', () => {
  it('surfaces sent:false and the provider error when the provider send throws, while still recording local history', async () => {
    prismaMock.mailMessage.findFirst.mockResolvedValueOnce(null); // no replyToMessageId
    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Firm',
      email: {
        provider: 'outlook',
        fromEmail: 'firm@outlook.com',
        outlook: { user: 'firm@outlook.com', refreshToken: 'r1' },
      },
    });
    const send = jest
      .fn()
      .mockRejectedValue(new Error('Graph sendMail failed: 503 Service Unavailable'));
    createGraphMailClientMock.mockResolvedValue({ send });
    prismaMock.client.findFirst.mockResolvedValue(null);
    prismaMock.mailMessage.create.mockResolvedValue(
      mailMessageRow({ id: 'out-fail-1', direction: 'OUTBOUND' })
    );
    prismaMock.client.findMany.mockResolvedValue([]);

    const result = await sendMailboxMessage('t1', 'user-1', {
      to: 'client@acme.com',
      subject: 'Hello',
      body: 'New thread',
    });

    expect(result.sent).toBe(false);
    expect(result.error).toBe('Graph sendMail failed: 503 Service Unavailable');
    expect(result.dto.id).toBe('out-fail-1');
    expect(prismaMock.mailMessage.create).toHaveBeenCalledTimes(1);
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
    prismaMock.mailMessage.create.mockResolvedValue(
      mailMessageRow({ id: 'out-2', direction: 'OUTBOUND' })
    );
    prismaMock.client.findMany.mockResolvedValue([]);

    const result = await sendMailboxMessage('t1', null, {
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
    expect(result.dto.id).toBe('out-2');
    expect(result.sent).toBe(true);
    // brand-new local send (no reply) → conversationId is a fresh local:<uuid>
    const createdData = prismaMock.mailMessage.create.mock.calls[0][0].data;
    expect(createdData.conversationId).toMatch(/^local:/);
  });

  it('still inserts the OUTBOUND row even when tenantMailerSend fails, and surfaces sent:false', async () => {
    loadTenantEmailContextMock.mockResolvedValue({ tenantId: 't1', tenantName: 'Firm', email: {} });
    prismaMock.client.findFirst.mockResolvedValue(null);
    tenantMailerSendMock.mockResolvedValue({ success: false, error: 'suppressed' });
    prismaMock.mailMessage.create.mockResolvedValue(
      mailMessageRow({ id: 'out-3', direction: 'OUTBOUND' })
    );
    prismaMock.client.findMany.mockResolvedValue([]);

    const result = await sendMailboxMessage('t1', null, {
      to: 'client@acme.com',
      subject: 'Hello',
      body: 'New thread',
    });

    expect(prismaMock.mailMessage.create).toHaveBeenCalledTimes(1);
    expect(result.dto.id).toBe('out-3');
    expect(result.sent).toBe(false);
    expect(result.error).toBe('suppressed');
  });
});

describe('markMailboxRead — F3: provider-aware write-back', () => {
  beforeEach(() => {
    // An earlier test queues a mockResolvedValueOnce that its own code path
    // never consumes (guarded by an if it doesn't hit) — clearAllMocks()
    // resets call history but not that queued once-value, so reset here to
    // guarantee a clean slate before each test sets its own return value.
    prismaMock.mailMessage.findFirst.mockReset();
  });

  it('SMTP-provider row under a Graph connection updates locally and never calls the provider', async () => {
    prismaMock.mailMessage.findFirst.mockResolvedValue({
      id: 'm1',
      provider: 'SMTP',
      externalId: 'local-seed:c1:records',
    });
    prismaMock.mailMessage.update.mockResolvedValue({});
    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Firm',
      email: { provider: 'outlook', outlook: { user: 'firm@outlook.com', refreshToken: 'r1' } },
    });

    await markMailboxRead('t1', 'm1', true);

    expect(prismaMock.mailMessage.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { isRead: true },
    });
    expect(createGraphMailClientMock).not.toHaveBeenCalled();
    expect(createGmailMailClientMock).not.toHaveBeenCalled();
  });

  it('a Gmail row left over after a switch to Graph updates locally and never calls the provider', async () => {
    prismaMock.mailMessage.findFirst.mockResolvedValue({
      id: 'm2',
      provider: 'GMAIL',
      externalId: 'gm-old-1',
    });
    prismaMock.mailMessage.update.mockResolvedValue({});
    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Firm',
      email: {
        provider: 'microsoft365',
        outlook: { user: 'firm@outlook.com', refreshToken: 'r1' },
      },
    });

    await markMailboxRead('t1', 'm2', true);

    expect(prismaMock.mailMessage.update).toHaveBeenCalledWith({
      where: { id: 'm2' },
      data: { isRead: true },
    });
    expect(createGraphMailClientMock).not.toHaveBeenCalled();
    expect(createGmailMailClientMock).not.toHaveBeenCalled();
  });

  it('a matching-provider row still writes back to the provider', async () => {
    prismaMock.mailMessage.findFirst.mockResolvedValue({
      id: 'm3',
      provider: 'OUTLOOK',
      externalId: 'graph-msg-1',
    });
    prismaMock.mailMessage.update.mockResolvedValue({});
    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Firm',
      email: { provider: 'outlook', outlook: { user: 'firm@outlook.com', refreshToken: 'r1' } },
    });
    const markRead = jest.fn().mockResolvedValue(undefined);
    createGraphMailClientMock.mockResolvedValue({ markRead });

    await markMailboxRead('t1', 'm3', true);

    expect(markRead).toHaveBeenCalledWith('graph-msg-1', true);
  });

  it('OUTLOOK/MICROSOFT365 are treated as the same provider family (no false mismatch)', async () => {
    prismaMock.mailMessage.findFirst.mockResolvedValue({
      id: 'm4',
      provider: 'OUTLOOK',
      externalId: 'graph-msg-2',
    });
    prismaMock.mailMessage.update.mockResolvedValue({});
    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Firm',
      email: {
        provider: 'microsoft365',
        outlook: { user: 'firm@outlook.com', refreshToken: 'r1' },
      },
    });
    const markRead = jest.fn().mockResolvedValue(undefined);
    createGraphMailClientMock.mockResolvedValue({ markRead });

    await markMailboxRead('t1', 'm4', true);

    expect(markRead).toHaveBeenCalledWith('graph-msg-2', true);
  });

  it('throws MESSAGE_NOT_FOUND when the row does not exist in this tenant', async () => {
    prismaMock.mailMessage.findFirst.mockResolvedValue(null);

    await expect(markMailboxRead('t1', 'missing', true)).rejects.toThrow('MESSAGE_NOT_FOUND');
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
