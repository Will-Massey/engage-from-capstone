/**
 * Task 2 — gmailMailClient: token refresh mocked via global fetch, googleapis
 * transport mocked by injecting a fake gmail_v1.Gmail client through deps.
 */

jest.mock('../../tenantEmailSettings.js', () => ({
  loadTenantEmailContext: jest.fn(),
}));

import type { gmail_v1 } from 'googleapis';
import { loadTenantEmailContext } from '../../tenantEmailSettings.js';
import { createGmailMailClient, clearMailTokenCache } from '../gmailMailClient.js';

const loadTenantEmailContextMock = loadTenantEmailContext as jest.Mock;
const fetchMock = jest.fn();

const GMAIL_CREDS = {
  clientId: 'gclient-1',
  clientSecret: 'gsecret-1',
  refreshToken: 'grefresh-1',
  user: 'practice@firm.com',
};

function ctxWithGmail(gmail: unknown = GMAIL_CREDS) {
  return {
    tenantId: 'tenant-1',
    tenantName: 'Firm',
    email: { gmail },
  };
}

function tokenResponse(accessToken = 'gaccess-1', expiresIn = 3600) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ access_token: accessToken, expires_in: expiresIn, token_type: 'Bearer' }),
  };
}

function b64url(s: string) {
  return Buffer.from(s).toString('base64url');
}

function makeFakeGmail(overrides: Record<string, any> = {}) {
  return {
    users: {
      getProfile: jest.fn().mockResolvedValue({ data: { historyId: '1000' } }),
      messages: {
        list: jest.fn().mockResolvedValue({ data: { messages: [] } }),
        get: jest.fn(),
        send: jest.fn().mockResolvedValue({ data: { id: 'sent-1' } }),
        modify: jest.fn().mockResolvedValue({ data: {} }),
        attachments: {
          get: jest.fn(),
        },
      },
      history: {
        list: jest.fn().mockResolvedValue({ data: { history: [], historyId: '1000' } }),
      },
      ...overrides.users,
    },
  };
}

function asGmail(fake: ReturnType<typeof makeFakeGmail>): gmail_v1.Gmail {
  return fake as unknown as gmail_v1.Gmail;
}

beforeEach(() => {
  jest.clearAllMocks();
  clearMailTokenCache();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('createGmailMailClient factory', () => {
  it('returns null when the tenant has no usable Gmail credentials', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithGmail(null));
    const client = await createGmailMailClient('tenant-1');
    expect(client).toBeNull();
  });

  it('returns null when the tenant is not found', async () => {
    loadTenantEmailContextMock.mockResolvedValue(null);
    const client = await createGmailMailClient('tenant-1');
    expect(client).toBeNull();
  });
});

describe('createGmailMailClient token refresh', () => {
  it('caches the access token — one token fetch serves two calls inside the expiry window', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithGmail());
    fetchMock.mockResolvedValue(tokenResponse('gaccess-1', 3600));
    const gmail = makeFakeGmail();

    const client = await createGmailMailClient('tenant-1', { gmail: asGmail(gmail) });
    await client!.syncInbox(null);
    await client!.syncSent(null);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const body = init.body as URLSearchParams;
    expect(body.get('client_id')).toBe('gclient-1');
    expect(body.get('client_secret')).toBe('gsecret-1');
    expect(body.get('refresh_token')).toBe('grefresh-1');
    expect(body.get('grant_type')).toBe('refresh_token');
  });

  it('refreshes again once the cached token is within the 60s early-expiry margin', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithGmail());
    fetchMock
      .mockResolvedValueOnce(tokenResponse('gaccess-1', 30))
      .mockResolvedValueOnce(tokenResponse('gaccess-2', 3600));
    const gmail = makeFakeGmail();

    const client = await createGmailMailClient('tenant-1', { gmail: asGmail(gmail) });
    await client!.syncInbox(null);
    await client!.syncSent(null);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('createGmailMailClient syncInbox', () => {
  it('does a full sync via users.messages.list/get when deltaLink is null, incl. attachments and HTML->text fallback', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithGmail());
    fetchMock.mockResolvedValue(tokenResponse());
    const gmail = makeFakeGmail();
    gmail.users.messages.list.mockResolvedValue({ data: { messages: [{ id: 'm-1' }] } });
    gmail.users.messages.get.mockResolvedValue({
      data: {
        id: 'm-1',
        threadId: 'thread-1',
        snippet: 'fallback snippet',
        labelIds: ['INBOX'],
        internalDate: '1754470800000',
        payload: {
          headers: [
            { name: 'Subject', value: 'Hello' },
            { name: 'From', value: 'Jane Doe <jane@client.com>' },
            { name: 'To', value: 'Firm <practice@firm.com>' },
            { name: 'Message-ID', value: '<gmail-abc@mail.gmail.com>' },
          ],
          mimeType: 'multipart/mixed',
          parts: [
            {
              mimeType: 'text/html',
              body: { data: b64url('<p>Hi <b>there</b>&nbsp;team</p>') },
            },
            {
              filename: 'invoice.pdf',
              mimeType: 'application/pdf',
              body: { attachmentId: 'att-1', size: 1234 },
            },
          ],
        },
      },
    });

    const client = await createGmailMailClient('tenant-1', { gmail: asGmail(gmail) });
    const page = await client!.syncInbox(null);

    expect(gmail.users.messages.list).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'me', labelIds: ['INBOX'] })
    );
    expect(page.messages).toHaveLength(1);
    const msg = page.messages[0];
    expect(msg.externalId).toBe('m-1');
    expect(msg.conversationId).toBe('thread-1');
    expect(msg.internetMessageId).toBe('<gmail-abc@mail.gmail.com>');
    expect(msg.direction).toBe('INBOUND');
    expect(msg.from).toBe('Jane Doe <jane@client.com>');
    expect(msg.to).toBe('Firm <practice@firm.com>');
    expect(msg.subject).toBe('Hello');
    expect(msg.bodyHtml).toBe('<p>Hi <b>there</b>&nbsp;team</p>');
    expect(msg.bodyText).toBe('Hi there team');
    expect(msg.isRead).toBe(true); // no UNREAD label
    expect(msg.hasAttachments).toBe(true);
    expect(msg.attachments).toEqual([
      {
        externalId: 'att-1',
        name: 'invoice.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1234,
        isInline: false,
      },
    ]);
    expect(msg.receivedAt).toEqual(new Date(1754470800000));
    expect(page.deltaLink).toBe('history:1000');
  });

  it('does an incremental sync via users.history.list when a deltaLink is provided', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithGmail());
    fetchMock.mockResolvedValue(tokenResponse());
    const gmail = makeFakeGmail();
    gmail.users.history.list.mockResolvedValue({
      data: {
        history: [{ messagesAdded: [{ message: { id: 'm-2' } }] }],
        historyId: '2000',
      },
    });
    gmail.users.messages.get.mockResolvedValue({
      data: {
        id: 'm-2',
        labelIds: ['INBOX', 'UNREAD'],
        payload: {
          headers: [{ name: 'Subject', value: 'New' }],
        },
      },
    });

    const client = await createGmailMailClient('tenant-1', { gmail: asGmail(gmail) });
    const page = await client!.syncInbox('history:1000');

    expect(gmail.users.history.list).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'me', startHistoryId: '1000' })
    );
    expect(gmail.users.messages.list).not.toHaveBeenCalled();
    expect(page.messages).toHaveLength(1);
    expect(page.messages[0].externalId).toBe('m-2');
    expect(page.messages[0].isRead).toBe(false);
    expect(page.deltaLink).toBe('history:2000');
  });

  it('F4: full sync queries newer_than:90d and caps maxResults per page', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithGmail());
    fetchMock.mockResolvedValue(tokenResponse());
    const gmail = makeFakeGmail();
    gmail.users.messages.list.mockResolvedValue({ data: { messages: [] } });

    const client = await createGmailMailClient('tenant-1', { gmail: asGmail(gmail) });
    await client!.syncInbox(null);

    expect(gmail.users.messages.list).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'newer_than:90d', maxResults: 100 })
    );
  });

  it('F4: caps the total messages fetched on a first sync at 200, stopping before the next page', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithGmail());
    fetchMock.mockResolvedValue(tokenResponse());
    const gmail = makeFakeGmail();
    gmail.users.messages.list
      .mockResolvedValueOnce({
        data: {
          messages: Array.from({ length: 100 }, (_, i) => ({ id: `p1-${i}` })),
          nextPageToken: 'p2',
        },
      })
      .mockResolvedValueOnce({
        data: {
          messages: Array.from({ length: 100 }, (_, i) => ({ id: `p2-${i}` })),
          nextPageToken: 'p3',
        },
      });
    gmail.users.messages.get.mockResolvedValue({ data: { id: 'x', payload: { headers: [] } } });

    const client = await createGmailMailClient('tenant-1', { gmail: asGmail(gmail) });
    const page = await client!.syncInbox(null);

    expect(page.messages).toHaveLength(200);
    // stops after the 200-message cap is reached — never requests page 3
    expect(gmail.users.messages.list).toHaveBeenCalledTimes(2);
  });

  it('F3: throws an error carrying the HTTP status code when the history cursor is stale (404)', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithGmail());
    fetchMock.mockResolvedValue(tokenResponse());
    const gmail = makeFakeGmail();
    gmail.users.history.list.mockRejectedValue(
      Object.assign(new Error('Not Found'), { code: 404 })
    );

    const client = await createGmailMailClient('tenant-1', { gmail: asGmail(gmail) });

    await expect(client!.syncInbox('history:1000')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('createGmailMailClient syncSent', () => {
  it('lists the SENT label and tags messages OUTBOUND', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithGmail());
    fetchMock.mockResolvedValue(tokenResponse());
    const gmail = makeFakeGmail();
    gmail.users.messages.list.mockResolvedValue({ data: { messages: [{ id: 's-1' }] } });
    gmail.users.messages.get.mockResolvedValue({
      data: {
        id: 's-1',
        labelIds: ['SENT'],
        payload: { headers: [{ name: 'Subject', value: 'Out' }] },
      },
    });

    const client = await createGmailMailClient('tenant-1', { gmail: asGmail(gmail) });
    const page = await client!.syncSent(null);

    expect(gmail.users.messages.list).toHaveBeenCalledWith(
      expect.objectContaining({ labelIds: ['SENT'] })
    );
    expect(page.messages[0].direction).toBe('OUTBOUND');
  });
});

describe('createGmailMailClient send', () => {
  it('builds a raw RFC 822 message for a fresh send', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithGmail());
    fetchMock.mockResolvedValue(tokenResponse());
    const gmail = makeFakeGmail();

    const client = await createGmailMailClient('tenant-1', { gmail: asGmail(gmail) });
    const result = await client!.send({
      to: ['a@client.com'],
      cc: ['b@client.com'],
      subject: 'Hi',
      bodyText: 'Body text',
    });

    expect(gmail.users.messages.get).not.toHaveBeenCalled();
    const call = gmail.users.messages.send.mock.calls[0][0];
    expect(call.userId).toBe('me');
    expect(call.requestBody.threadId).toBeUndefined();
    const raw = Buffer.from(call.requestBody.raw, 'base64url').toString('utf8');
    expect(raw).toContain('To: a@client.com');
    expect(raw).toContain('Cc: b@client.com');
    expect(raw).toContain('Subject: Hi');
    expect(raw).toContain('Body text');
    expect(result.externalId).toBe('sent-1');
  });

  it('builds a reply with In-Reply-To/References headers and the resolved threadId', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithGmail());
    fetchMock.mockResolvedValue(tokenResponse());
    const gmail = makeFakeGmail();
    gmail.users.messages.get.mockResolvedValue({ data: { id: 'orig-1', threadId: 'thread-9' } });

    const client = await createGmailMailClient('tenant-1', { gmail: asGmail(gmail) });
    await client!.send({
      to: ['a@client.com'],
      subject: 'Re: Hi',
      bodyText: 'Reply body',
      replyToExternalId: 'orig-1',
      inReplyToInternetMessageId: '<orig@mail.gmail.com>',
    });

    expect(gmail.users.messages.get).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'me', id: 'orig-1' })
    );
    const call = gmail.users.messages.send.mock.calls[0][0];
    expect(call.requestBody.threadId).toBe('thread-9');
    const raw = Buffer.from(call.requestBody.raw, 'base64url').toString('utf8');
    expect(raw).toContain('In-Reply-To: <orig@mail.gmail.com>');
    expect(raw).toContain('References: <orig@mail.gmail.com>');
  });
});

describe('createGmailMailClient markRead', () => {
  it('removes UNREAD via users.messages.modify when marking read', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithGmail());
    fetchMock.mockResolvedValue(tokenResponse());
    const gmail = makeFakeGmail();

    const client = await createGmailMailClient('tenant-1', { gmail: asGmail(gmail) });
    await client!.markRead('m-1', true);

    expect(gmail.users.messages.modify).toHaveBeenCalledWith({
      userId: 'me',
      id: 'm-1',
      requestBody: { removeLabelIds: ['UNREAD'] },
    });
  });

  it('adds UNREAD via users.messages.modify when marking unread', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithGmail());
    fetchMock.mockResolvedValue(tokenResponse());
    const gmail = makeFakeGmail();

    const client = await createGmailMailClient('tenant-1', { gmail: asGmail(gmail) });
    await client!.markRead('m-1', false);

    expect(gmail.users.messages.modify).toHaveBeenCalledWith({
      userId: 'me',
      id: 'm-1',
      requestBody: { addLabelIds: ['UNREAD'] },
    });
  });
});

describe('createGmailMailClient fetchAttachment', () => {
  it('fetches the message for filename/contentType metadata then the attachment bytes', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithGmail());
    fetchMock.mockResolvedValue(tokenResponse());
    const gmail = makeFakeGmail();
    gmail.users.messages.get.mockResolvedValue({
      data: {
        id: 'm-1',
        payload: {
          mimeType: 'multipart/mixed',
          parts: [
            {
              filename: 'invoice.pdf',
              mimeType: 'application/pdf',
              body: { attachmentId: 'att-1', size: 9 },
            },
          ],
        },
      },
    });
    gmail.users.messages.attachments = {
      get: jest.fn().mockResolvedValue({ data: { data: b64url('pdf-bytes') } }),
    };

    const client = await createGmailMailClient('tenant-1', { gmail: asGmail(gmail) });
    const attachment = await client!.fetchAttachment('m-1', 'att-1');

    expect(gmail.users.messages.attachments.get).toHaveBeenCalledWith({
      userId: 'me',
      messageId: 'm-1',
      id: 'att-1',
    });
    expect(attachment.name).toBe('invoice.pdf');
    expect(attachment.contentType).toBe('application/pdf');
    expect(attachment.content).toEqual(Buffer.from('pdf-bytes'));
  });
});
