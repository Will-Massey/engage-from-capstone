/**
 * Task 2 — graphMailClient: Graph HTTP mocked via global fetch.
 * Task 4 adds ensureGraphSubscription — same file, DB mocked for its
 * subscription-state persistence only (the rest of the client stays pure).
 */

jest.mock('../../tenantEmailSettings.js', () => ({
  loadTenantEmailContext: jest.fn(),
}));

const mailboxSyncStateFindUnique = jest.fn();
const mailboxSyncStateUpsert = jest.fn();
jest.mock('../../../config/database.js', () => ({
  prisma: {
    mailboxSyncState: {
      findUnique: (...args: unknown[]) => mailboxSyncStateFindUnique(...args),
      upsert: (...args: unknown[]) => mailboxSyncStateUpsert(...args),
    },
  },
}));

jest.mock('../../../config/urls.js', () => ({
  getApiUrl: () => 'https://api.test.example',
}));

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: () => 'generated-client-state-uuid',
}));

import { loadTenantEmailContext } from '../../tenantEmailSettings.js';
import {
  createGraphMailClient,
  clearMailTokenCache,
  ensureGraphSubscription,
} from '../graphMailClient.js';

const loadTenantEmailContextMock = loadTenantEmailContext as jest.Mock;
const fetchMock = jest.fn();

const OUTLOOK_CREDS = {
  clientId: 'client-1',
  clientSecret: 'secret-1',
  refreshToken: 'refresh-1',
  user: 'practice@firm.com',
};

function ctxWithOutlook(outlook: unknown = OUTLOOK_CREDS) {
  return {
    tenantId: 'tenant-1',
    tenantName: 'Firm',
    email: { outlook },
  };
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => body,
    arrayBuffer: async () => Buffer.from(JSON.stringify(body)),
  };
}

function tokenResponse(accessToken = 'access-token-1', expiresIn = 3600) {
  return jsonResponse({ access_token: accessToken, expires_in: expiresIn, token_type: 'Bearer' });
}

beforeEach(() => {
  jest.clearAllMocks();
  clearMailTokenCache();
  global.fetch = fetchMock as unknown as typeof fetch;
  mailboxSyncStateFindUnique.mockResolvedValue(null);
  mailboxSyncStateUpsert.mockResolvedValue({});
});

describe('createGraphMailClient factory', () => {
  it('returns null when the tenant has no usable Outlook credentials', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithOutlook(null));
    const client = await createGraphMailClient('tenant-1');
    expect(client).toBeNull();
  });

  it('returns null when the tenant is not found', async () => {
    loadTenantEmailContextMock.mockResolvedValue(null);
    const client = await createGraphMailClient('tenant-1');
    expect(client).toBeNull();
  });

  it('returns null when clientSecret is missing', async () => {
    loadTenantEmailContextMock.mockResolvedValue(
      ctxWithOutlook({ clientId: 'x', refreshToken: 'y', user: 'z' })
    );
    const client = await createGraphMailClient('tenant-1');
    expect(client).toBeNull();
  });
});

describe('createGraphMailClient token refresh', () => {
  it('refreshes with the exact single-scope set required by the brief', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithOutlook());
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        jsonResponse({ value: [], '@odata.deltaLink': 'https://graph/delta?token=abc' })
      );

    const client = await createGraphMailClient('tenant-1');
    await client!.syncInbox(null);

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/token');
    const body = tokenInit.body as URLSearchParams;
    expect(body.get('client_id')).toBe('client-1');
    expect(body.get('client_secret')).toBe('secret-1');
    expect(body.get('refresh_token')).toBe('refresh-1');
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('scope')).toBe(
      'https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send offline_access'
    );
  });

  it('caches the access token — one token fetch serves two calls inside the expiry window', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithOutlook());
    fetchMock
      .mockResolvedValueOnce(tokenResponse('access-token-1', 3600))
      .mockResolvedValueOnce(jsonResponse({ value: [], '@odata.deltaLink': 'https://graph/delta?a' }))
      .mockResolvedValueOnce(jsonResponse({ value: [], '@odata.deltaLink': 'https://graph/delta?b' }));

    const client = await createGraphMailClient('tenant-1');
    await client!.syncInbox(null);
    await client!.syncSent(null);

    const tokenCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('oauth2/v2.0/token'));
    expect(tokenCalls).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('refreshes again once the cached token is within the 60s early-expiry margin', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithOutlook());
    fetchMock
      .mockResolvedValueOnce(tokenResponse('access-token-1', 30)) // expires in 30s — inside the 60s margin
      .mockResolvedValueOnce(jsonResponse({ value: [], '@odata.deltaLink': 'https://graph/delta?a' }))
      .mockResolvedValueOnce(tokenResponse('access-token-2', 3600))
      .mockResolvedValueOnce(jsonResponse({ value: [], '@odata.deltaLink': 'https://graph/delta?b' }));

    const client = await createGraphMailClient('tenant-1');
    await client!.syncInbox(null);
    await client!.syncSent(null);

    const tokenCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('oauth2/v2.0/token'));
    expect(tokenCalls).toHaveLength(2);
  });
});

describe('createGraphMailClient syncInbox', () => {
  it('maps delta fields to ProviderMessage, decoding HTML bodies to a text fallback', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithOutlook());
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
      jsonResponse({
        value: [
          {
            id: 'msg-1',
            conversationId: 'conv-1',
            internetMessageId: '<abc@firm.com>',
            subject: 'Hello',
            from: { emailAddress: { name: 'Jane Doe', address: 'jane@client.com' } },
            toRecipients: [{ emailAddress: { name: 'Firm', address: 'practice@firm.com' } }],
            ccRecipients: [{ emailAddress: { address: 'cc@client.com' } }],
            bodyPreview: 'Hi there',
            body: { contentType: 'html', content: '<p>Hi <b>there</b>&nbsp;team</p>' },
            isRead: false,
            hasAttachments: true,
            receivedDateTime: '2026-08-06T10:00:00Z',
          },
        ],
        '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=xyz',
      })
    );

    const client = await createGraphMailClient('tenant-1');
    const page = await client!.syncInbox(null);

    expect(page.messages).toHaveLength(1);
    const msg = page.messages[0];
    expect(msg.externalId).toBe('msg-1');
    expect(msg.conversationId).toBe('conv-1');
    expect(msg.internetMessageId).toBe('<abc@firm.com>');
    expect(msg.direction).toBe('INBOUND');
    expect(msg.from).toBe('Jane Doe <jane@client.com>');
    expect(msg.to).toBe('Firm <practice@firm.com>');
    expect(msg.cc).toBe('cc@client.com');
    expect(msg.subject).toBe('Hello');
    expect(msg.bodyHtml).toBe('<p>Hi <b>there</b>&nbsp;team</p>');
    expect(msg.bodyText).toBe('Hi there team');
    expect(msg.isRead).toBe(false);
    expect(msg.hasAttachments).toBe(true);
    expect(msg.receivedAt).toEqual(new Date('2026-08-06T10:00:00Z'));
    expect(page.deltaLink).toBe(
      'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=xyz'
    );
  });

  it('requests the inbox delta endpoint with the required $select fields when starting fresh', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithOutlook());
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({ value: [], '@odata.deltaLink': 'https://x/delta' }));

    const client = await createGraphMailClient('tenant-1');
    await client!.syncInbox(null);

    const url = String(fetchMock.mock.calls[1][0]);
    expect(url).toContain('/v1.0/me/mailFolders/inbox/messages/delta');
    expect(url).toContain('$select=');
    for (const field of [
      'id',
      'conversationId',
      'internetMessageId',
      'subject',
      'from',
      'toRecipients',
      'ccRecipients',
      'bodyPreview',
      'body',
      'isRead',
      'hasAttachments',
      'receivedDateTime',
      'sentDateTime',
    ]) {
      expect(url).toContain(field);
    }
    expect(decodeURIComponent(url)).toContain(
      '$expand=attachments($select=id,name,contentType,size,isInline)'
    );
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer access-token-1');
  });

  it('maps expanded attachments into ProviderMessage.attachments', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithOutlook());
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
      jsonResponse({
        value: [
          {
            id: 'msg-1',
            subject: 'Has attachment',
            isRead: true,
            hasAttachments: true,
            attachments: [
              {
                id: 'att-1',
                name: 'invoice.pdf',
                contentType: 'application/pdf',
                size: 1234,
                isInline: false,
              },
              {
                id: 'att-2',
                name: 'logo.png',
                contentType: 'image/png',
                size: 56,
                isInline: true,
              },
            ],
          },
        ],
        '@odata.deltaLink': 'https://x/delta',
      })
    );

    const client = await createGraphMailClient('tenant-1');
    const page = await client!.syncInbox(null);

    expect(page.messages[0].attachments).toEqual([
      { externalId: 'att-1', name: 'invoice.pdf', contentType: 'application/pdf', sizeBytes: 1234, isInline: false },
      { externalId: 'att-2', name: 'logo.png', contentType: 'image/png', sizeBytes: 56, isInline: true },
    ]);
  });

  it('leaves attachments undefined when the message has none', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithOutlook());
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
      jsonResponse({
        value: [{ id: 'msg-1', subject: 'No attachment', isRead: true, hasAttachments: false }],
        '@odata.deltaLink': 'https://x/delta',
      })
    );

    const client = await createGraphMailClient('tenant-1');
    const page = await client!.syncInbox(null);

    expect(page.messages[0].attachments).toBeUndefined();
  });

  it('resumes from a stored deltaLink instead of rebuilding the initial query', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithOutlook());
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({ value: [], '@odata.deltaLink': 'https://graph/delta?next' }));

    const client = await createGraphMailClient('tenant-1');
    await client!.syncInbox('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=prev');

    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=prev'
    );
  });

  it('follows @odata.nextLink pages before returning the final @odata.deltaLink', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithOutlook());
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        jsonResponse({
          value: [{ id: 'msg-1', subject: 'A', isRead: true, hasAttachments: false }],
          '@odata.nextLink': 'https://graph/next-page',
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          value: [{ id: 'msg-2', subject: 'B', isRead: true, hasAttachments: false }],
          '@odata.deltaLink': 'https://graph/delta?final',
        })
      );

    const client = await createGraphMailClient('tenant-1');
    const page = await client!.syncInbox(null);

    expect(fetchMock.mock.calls[2][0]).toBe('https://graph/next-page');
    expect(page.messages.map((m) => m.externalId)).toEqual(['msg-1', 'msg-2']);
    expect(page.deltaLink).toBe('https://graph/delta?final');
  });
});

describe('createGraphMailClient syncSent', () => {
  it('requests the sentitems delta endpoint and tags messages OUTBOUND', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithOutlook());
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
      jsonResponse({
        value: [{ id: 'sent-1', subject: 'Sent', isRead: true, hasAttachments: false, sentDateTime: '2026-08-06T09:00:00Z' }],
        '@odata.deltaLink': 'https://x/delta',
      })
    );

    const client = await createGraphMailClient('tenant-1');
    const page = await client!.syncSent(null);

    expect(fetchMock.mock.calls[1][0]).toContain('/v1.0/me/mailFolders/sentitems/messages/delta');
    expect(page.messages[0].direction).toBe('OUTBOUND');
    expect(page.messages[0].receivedAt).toEqual(new Date('2026-08-06T09:00:00Z'));
  });
});

describe('createGraphMailClient send', () => {
  it('POSTs sendMail for a fresh message', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithOutlook());
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse({}, true, 202));

    const client = await createGraphMailClient('tenant-1');
    const result = await client!.send({
      to: ['a@client.com'],
      cc: ['b@client.com'],
      subject: 'Hi',
      bodyText: 'Body text',
    });

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/sendMail');
    expect(init.method).toBe('POST');
    const payload = JSON.parse(init.body);
    expect(payload.message.subject).toBe('Hi');
    expect(payload.message.toRecipients).toEqual([{ emailAddress: { address: 'a@client.com' } }]);
    expect(payload.message.ccRecipients).toEqual([{ emailAddress: { address: 'b@client.com' } }]);
    expect(payload.message.body.content).toBe('Body text');
    expect(result.externalId).toBeNull();
  });

  it('POSTs to /messages/{id}/reply when replyToExternalId is set', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithOutlook());
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse({}, true, 202));

    const client = await createGraphMailClient('tenant-1');
    await client!.send({
      to: ['a@client.com'],
      subject: 'Re: Hi',
      bodyText: 'Reply body',
      replyToExternalId: 'orig-msg-1',
    });

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/messages/orig-msg-1/reply');
    expect(init.method).toBe('POST');
    const payload = JSON.parse(init.body);
    expect(payload.comment).toBe('Reply body');
  });
});

describe('createGraphMailClient markRead', () => {
  it('PATCHes the message isRead flag', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithOutlook());
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse({}, true, 200));

    const client = await createGraphMailClient('tenant-1');
    await client!.markRead('msg-1', true);

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/messages/msg-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ isRead: true });
  });
});

describe('createGraphMailClient fetchAttachment', () => {
  it('fetches attachment metadata then binary content via $value', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithOutlook());
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({ name: 'invoice.pdf', contentType: 'application/pdf' }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => Buffer.from('pdf-bytes'),
      });

    const client = await createGraphMailClient('tenant-1');
    const attachment = await client!.fetchAttachment('msg-1', 'att-1');

    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://graph.microsoft.com/v1.0/me/messages/msg-1/attachments/att-1'
    );
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://graph.microsoft.com/v1.0/me/messages/msg-1/attachments/att-1/$value'
    );
    expect(attachment.name).toBe('invoice.pdf');
    expect(attachment.contentType).toBe('application/pdf');
    expect(attachment.content).toEqual(Buffer.from('pdf-bytes'));
  });
});

describe('ensureGraphSubscription', () => {
  it('returns ok:false without touching the DB when the tenant has no Graph credentials', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithOutlook(null));

    const result = await ensureGraphSubscription('tenant-1');

    expect(result.ok).toBe(false);
    expect(mailboxSyncStateFindUnique).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates a new subscription and persists id/expiry/clientState when none exists yet', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithOutlook());
    mailboxSyncStateFindUnique.mockResolvedValue(null);
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        jsonResponse({ id: 'sub-1', expirationDateTime: '2026-08-10T00:00:00Z' })
      );

    const result = await ensureGraphSubscription('tenant-1');

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://graph.microsoft.com/v1.0/subscriptions');
    expect(init.method).toBe('POST');
    const payload = JSON.parse(init.body);
    expect(payload.resource).toBe("me/mailFolders('inbox')/messages");
    expect(payload.changeType).toBe('created,updated');
    expect(payload.notificationUrl).toBe('https://api.test.example/api/webhooks/graph-mail');
    expect(payload.clientState).toBe('generated-client-state-uuid');

    expect(mailboxSyncStateUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1' },
        create: expect.objectContaining({
          tenantId: 'tenant-1',
          subscriptionId: 'sub-1',
          clientState: 'generated-client-state-uuid',
        }),
        update: expect.objectContaining({
          subscriptionId: 'sub-1',
          clientState: 'generated-client-state-uuid',
        }),
      })
    );
  });

  it('renews an existing subscription via PATCH, preserving the stored clientState', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithOutlook());
    mailboxSyncStateFindUnique.mockResolvedValue({
      subscriptionId: 'sub-existing',
      clientState: 'existing-client-state',
    });
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        jsonResponse({ id: 'sub-existing', expirationDateTime: '2026-08-10T00:00:00Z' })
      );

    const result = await ensureGraphSubscription('tenant-1');

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://graph.microsoft.com/v1.0/subscriptions/sub-existing');
    expect(init.method).toBe('PATCH');
    expect(fetchMock).toHaveBeenCalledTimes(2); // no fallback create call

    expect(mailboxSyncStateUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          subscriptionId: 'sub-existing',
          clientState: 'existing-client-state',
        }),
      })
    );
  });

  it('falls back to creating a fresh subscription when renewal fails (e.g. the subscription expired server-side)', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithOutlook());
    mailboxSyncStateFindUnique.mockResolvedValue({
      subscriptionId: 'sub-gone',
      clientState: 'existing-client-state',
    });
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({}, false, 404))
      .mockResolvedValueOnce(
        jsonResponse({ id: 'sub-new', expirationDateTime: '2026-08-10T00:00:00Z' })
      );

    const result = await ensureGraphSubscription('tenant-1');

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe('https://graph.microsoft.com/v1.0/subscriptions/sub-gone');
    expect(fetchMock.mock.calls[2][0]).toBe('https://graph.microsoft.com/v1.0/subscriptions');
    expect(fetchMock.mock.calls[2][1].method).toBe('POST');

    expect(mailboxSyncStateUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          subscriptionId: 'sub-new',
          clientState: 'generated-client-state-uuid', // regenerated on create
        }),
      })
    );
  });

  it('returns ok:false and never throws when the Graph API call fails outright', async () => {
    loadTenantEmailContextMock.mockResolvedValue(ctxWithOutlook());
    mailboxSyncStateFindUnique.mockResolvedValue(null);
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({}, false, 500));

    const result = await ensureGraphSubscription('tenant-1');

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(mailboxSyncStateUpsert).not.toHaveBeenCalled();
  });
});
