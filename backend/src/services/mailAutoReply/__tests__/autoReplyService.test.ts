const prismaMock = {
  tenant: { findUnique: jest.fn() },
  mailMessage: { findFirst: jest.fn(), findMany: jest.fn() },
  mailAiReplyDraft: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  activityLog: { create: jest.fn() },
  client: { findFirst: jest.fn() },
  job: { findMany: jest.fn() },
  proposal: { findMany: jest.fn() },
  documentRequest: { findMany: jest.fn() },
};
jest.mock('../../../config/database.js', () => ({ prisma: prismaMock }));

const chatCompletionMock = jest.fn();
const checkAiTokenBudgetMock = jest.fn();
const getAiModelMock = jest.fn();
jest.mock('../../ai/aiClient.js', () => ({
  chatCompletion: (...a: unknown[]) => chatCompletionMock(...a),
  checkAiTokenBudget: (...a: unknown[]) => checkAiTokenBudgetMock(...a),
  getAiModel: (...a: unknown[]) => getAiModelMock(...a),
  tokenMetaFromUsage: (usage?: Record<string, number>) => {
    const meta: Record<string, number> = {};
    if (usage?.prompt_tokens != null) meta.prompt_tokens = usage.prompt_tokens;
    if (usage?.completion_tokens != null) meta.completion_tokens = usage.completion_tokens;
    if (usage?.total_tokens != null) meta.total_tokens = usage.total_tokens;
    return meta;
  },
}));

const sendMailboxMessageMock = jest.fn();
jest.mock('../../mailboxService.js', () => ({
  sendMailboxMessage: (...a: unknown[]) => sendMailboxMessageMock(...a),
  getThread: jest.fn().mockResolvedValue([]),
}));

import {
  processNewInboundMessages,
  approveDraft,
  dismissDraft,
  listPendingDrafts,
  AUTO_REPLY_MAX_MESSAGE_AGE_MS,
  AUTO_REPLY_MAX_BATCH_SIZE,
} from '../index.js';

const inbound = {
  id: 'm1',
  tenantId: 't1',
  direction: 'INBOUND',
  fromAddress: 'ada@acme.co.uk',
  toAddresses: 'practice@fortis.co.uk',
  subject: 'VAT question',
  bodyText: 'Do I need to register for VAT?',
  conversationId: 'c1',
  clientId: 'cl1',
  receivedAt: new Date('2026-08-11T09:30:00Z'),
};

function settings(mailAutoReply: unknown) {
  return { settings: JSON.stringify({ mailAutoReply }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.tenant.findUnique.mockResolvedValue(settings({ enabled: true, mode: 'draft' }));
  prismaMock.mailMessage.findFirst.mockResolvedValue(inbound);
  prismaMock.mailMessage.findMany.mockResolvedValue([inbound]);
  prismaMock.mailAiReplyDraft.findUnique.mockResolvedValue(null);
  prismaMock.mailAiReplyDraft.findFirst.mockResolvedValue(null);
  prismaMock.mailAiReplyDraft.count.mockResolvedValue(0);
  prismaMock.mailAiReplyDraft.create.mockImplementation(({ data }: any) => ({ id: 'd1', ...data }));
  prismaMock.mailAiReplyDraft.update.mockImplementation(({ data }: any) => ({ id: 'd1', ...data }));
  prismaMock.mailAiReplyDraft.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.client.findFirst.mockResolvedValue({
    id: 'cl1',
    name: 'Acme Ltd',
    contactName: 'Ada',
  });
  prismaMock.job.findMany.mockResolvedValue([]);
  prismaMock.proposal.findMany.mockResolvedValue([]);
  prismaMock.documentRequest.findMany.mockResolvedValue([]);
  checkAiTokenBudgetMock.mockResolvedValue({ withinBudget: true });
  getAiModelMock.mockReturnValue('grok-3-mini');
  chatCompletionMock.mockResolvedValue({
    content: 'Thanks Ada — here is the position.',
    usage: {},
  });
  sendMailboxMessageMock.mockResolvedValue({ dto: { id: 'sent1' }, sent: true });
  prismaMock.activityLog.create.mockResolvedValue({});
});

describe('processNewInboundMessages — gates', () => {
  it('creates a pending draft and does not send in draft mode', async () => {
    await processNewInboundMessages('t1', ['m1']);
    expect(prismaMock.mailAiReplyDraft.create).toHaveBeenCalled();
    const data = prismaMock.mailAiReplyDraft.create.mock.calls[0][0].data;
    expect(data.status).toBe('pending');
    expect(sendMailboxMessageMock).not.toHaveBeenCalled();
  });

  it('stores the configured model alongside usage in generationMeta', async () => {
    await processNewInboundMessages('t1', ['m1']);
    const data = prismaMock.mailAiReplyDraft.create.mock.calls[0][0].data;
    const meta = JSON.parse(data.generationMeta);
    expect(meta.model).toBe('grok-3-mini');
    expect(meta).toHaveProperty('usage');
  });

  it('resolves without throwing when the tenant lookup rejects, and makes no AI call', async () => {
    prismaMock.tenant.findUnique.mockRejectedValue(new Error('connection pool exhausted'));
    await expect(processNewInboundMessages('t1', ['m1'])).resolves.toBeUndefined();
    expect(chatCompletionMock).not.toHaveBeenCalled();
  });

  it('treats a P2002 on draft create as a lost idempotency race and does not write a failed row', async () => {
    prismaMock.mailAiReplyDraft.create.mockImplementation(() => {
      const err: any = new Error('Unique constraint failed');
      err.code = 'P2002';
      throw err;
    });
    await expect(processNewInboundMessages('t1', ['m1'])).resolves.toBeUndefined();
    expect(
      prismaMock.mailAiReplyDraft.create.mock.calls.some(
        (call: any) => call[0].data.status === 'failed'
      )
    ).toBe(false);
  });

  it('uses the inbound message itself as the thread when conversationId is null', async () => {
    prismaMock.mailMessage.findFirst.mockResolvedValue({ ...inbound, conversationId: null });
    await processNewInboundMessages('t1', ['m1']);
    expect(prismaMock.mailMessage.findMany).not.toHaveBeenCalled();
  });

  it('does nothing when the tenant has not opted in', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(settings({ enabled: false, mode: 'draft' }));
    await processNewInboundMessages('t1', ['m1']);
    expect(chatCompletionMock).not.toHaveBeenCalled();
    expect(prismaMock.mailAiReplyDraft.create).not.toHaveBeenCalled();
  });

  it('skips a message with no linked client', async () => {
    prismaMock.mailMessage.findFirst.mockResolvedValue({ ...inbound, clientId: null });
    await processNewInboundMessages('t1', ['m1']);
    expect(chatCompletionMock).not.toHaveBeenCalled();
  });

  it('skips an automated sender', async () => {
    prismaMock.mailMessage.findFirst.mockResolvedValue({
      ...inbound,
      fromAddress: 'no-reply@xero.com',
    });
    await processNewInboundMessages('t1', ['m1']);
    expect(chatCompletionMock).not.toHaveBeenCalled();
  });

  it('skips when a draft already exists for that message', async () => {
    prismaMock.mailAiReplyDraft.findUnique.mockResolvedValue({ id: 'existing' });
    await processNewInboundMessages('t1', ['m1']);
    expect(chatCompletionMock).not.toHaveBeenCalled();
  });

  it('skips when the AI budget is exhausted', async () => {
    checkAiTokenBudgetMock.mockResolvedValue({ withinBudget: false });
    await processNewInboundMessages('t1', ['m1']);
    expect(chatCompletionMock).not.toHaveBeenCalled();
  });

  it('records a failed draft when generation throws, and never rethrows', async () => {
    chatCompletionMock.mockRejectedValue(new Error('provider down'));
    await expect(processNewInboundMessages('t1', ['m1'])).resolves.toBeUndefined();
    const created = prismaMock.mailAiReplyDraft.create.mock.calls[0][0].data;
    expect(created.status).toBe('failed');
    expect(created.error).toContain('provider down');
  });

  it('skips a message whose receivedAt is older than the recency window (first-sync / provider-switch backlog)', async () => {
    prismaMock.mailMessage.findFirst.mockResolvedValue({
      ...inbound,
      receivedAt: new Date(Date.now() - AUTO_REPLY_MAX_MESSAGE_AGE_MS - 60_000),
    });
    await processNewInboundMessages('t1', ['m1']);
    expect(chatCompletionMock).not.toHaveBeenCalled();
    expect(prismaMock.mailAiReplyDraft.create).not.toHaveBeenCalled();
  });

  it('generates for a message within the recency window', async () => {
    prismaMock.mailMessage.findFirst.mockResolvedValue({
      ...inbound,
      receivedAt: new Date(Date.now() - 60_000),
    });
    await processNewInboundMessages('t1', ['m1']);
    expect(chatCompletionMock).toHaveBeenCalled();
  });

  it('caps a burst to AUTO_REPLY_MAX_BATCH_SIZE and does not process the rest', async () => {
    const ids = Array.from({ length: AUTO_REPLY_MAX_BATCH_SIZE + 5 }, (_, i) => `m${i}`);
    await processNewInboundMessages('t1', ids);
    expect(prismaMock.mailMessage.findFirst).toHaveBeenCalledTimes(AUTO_REPLY_MAX_BATCH_SIZE);
  });

  it('logs an AI_FEATURE_USED activity row after a successful generation, carrying token usage', async () => {
    chatCompletionMock.mockResolvedValue({
      content: 'Thanks Ada — here is the position.',
      usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
    });
    await processNewInboundMessages('t1', ['m1']);
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 't1',
          action: 'AI_FEATURE_USED',
          entityType: 'AI',
        }),
      })
    );
    const meta = JSON.parse(prismaMock.activityLog.create.mock.calls[0][0].data.metadata);
    expect(meta.total_tokens).toBe(200);
  });

  it('does not let a failure to log AI usage break draft creation', async () => {
    prismaMock.activityLog.create.mockRejectedValue(new Error('log db down'));
    await expect(processNewInboundMessages('t1', ['m1'])).resolves.toBeUndefined();
    expect(prismaMock.mailAiReplyDraft.create).toHaveBeenCalled();
    const data = prismaMock.mailAiReplyDraft.create.mock.calls[0][0].data;
    expect(data.status).toBe('pending');
  });
});

describe('processNewInboundMessages — auto mode', () => {
  beforeEach(() => {
    prismaMock.tenant.findUnique.mockResolvedValue(
      settings({ enabled: true, mode: 'auto', businessHoursOnly: false })
    );
  });

  it('sends via the mailbox send path and marks the draft sent', async () => {
    await processNewInboundMessages('t1', ['m1']);
    expect(sendMailboxMessageMock).toHaveBeenCalledWith(
      't1',
      null,
      expect.objectContaining({ to: 'ada@acme.co.uk', replyToMessageId: 'm1' })
    );
    expect(prismaMock.mailAiReplyDraft.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'sent' }) })
    );
  });

  it('leaves the draft pending when the conversation is in cooldown', async () => {
    prismaMock.mailAiReplyDraft.findFirst.mockResolvedValue({
      id: 'recent',
      decidedAt: new Date(),
    });
    await processNewInboundMessages('t1', ['m1']);
    expect(sendMailboxMessageMock).not.toHaveBeenCalled();
    expect(prismaMock.mailAiReplyDraft.create.mock.calls[0][0].data.status).toBe('pending');
  });

  it('leaves the draft pending when the generated body names an amount', async () => {
    chatCompletionMock.mockResolvedValue({
      content: 'Your VAT due is £1,247.50, payable by 7 October.',
      usage: {},
    });
    await processNewInboundMessages('t1', ['m1']);
    expect(sendMailboxMessageMock).not.toHaveBeenCalled();
    expect(prismaMock.mailAiReplyDraft.create.mock.calls[0][0].data.status).toBe('pending');
  });

  it('leaves the draft pending once the tenant daily cap is reached', async () => {
    prismaMock.mailAiReplyDraft.count.mockResolvedValue(20);
    await processNewInboundMessages('t1', ['m1']);
    expect(sendMailboxMessageMock).not.toHaveBeenCalled();
  });

  it('leaves the draft pending outside business hours when the setting is on', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(
      settings({ enabled: true, mode: 'auto', businessHoursOnly: true })
    );
    jest.useFakeTimers().setSystemTime(new Date('2026-08-09T10:00:00Z')); // Sunday
    await processNewInboundMessages('t1', ['m1']);
    jest.useRealTimers();
    expect(sendMailboxMessageMock).not.toHaveBeenCalled();
  });

  it('claims the draft pending -> sending before calling send', async () => {
    await processNewInboundMessages('t1', ['m1']);
    const claimCall = prismaMock.mailAiReplyDraft.updateMany.mock.calls.find(
      (c: any) => c[0]?.data?.status === 'sending'
    );
    expect(claimCall).toBeDefined();
    expect(claimCall[0].where).toEqual(
      expect.objectContaining({ tenantId: 't1', status: 'pending' })
    );
    // The claim must happen before send is invoked.
    const claimIndex = prismaMock.mailAiReplyDraft.updateMany.mock.invocationCallOrder[0];
    const sendIndex = sendMailboxMessageMock.mock.invocationCallOrder[0];
    expect(claimIndex).toBeLessThan(sendIndex);
  });

  it('does not attempt to send when another run already claimed the draft', async () => {
    prismaMock.mailAiReplyDraft.updateMany.mockResolvedValue({ count: 0 });
    await processNewInboundMessages('t1', ['m1']);
    expect(sendMailboxMessageMock).not.toHaveBeenCalled();
  });

  it('a thrown send error lands the draft as failed, never pending, so a retry cannot double-send', async () => {
    sendMailboxMessageMock.mockRejectedValue(new Error('write ECONNRESET'));
    await expect(processNewInboundMessages('t1', ['m1'])).resolves.toBeUndefined();
    const finalUpdate = prismaMock.mailAiReplyDraft.update.mock.calls.at(-1)[0];
    expect(finalUpdate.data.status).toBe('failed');
    expect(finalUpdate.data.status).not.toBe('pending');
    expect(finalUpdate.data.error).toContain('write ECONNRESET');
    // Only ever one draft row created for this message — no second draft
    // attempted after the ambiguous failure.
    expect(prismaMock.mailAiReplyDraft.create).toHaveBeenCalledTimes(1);
  });

  it('a returned { sent: false } is unambiguous and returns the draft to pending for a legitimate retry', async () => {
    sendMailboxMessageMock.mockResolvedValue({ dto: null, sent: false, error: 'Send failed' });
    await processNewInboundMessages('t1', ['m1']);
    const finalUpdate = prismaMock.mailAiReplyDraft.update.mock.calls.at(-1)[0];
    expect(finalUpdate.data.status).toBe('pending');
  });
});

describe('approveDraft — double-click guard', () => {
  const pendingDraft = {
    id: 'd1',
    tenantId: 't1',
    inboundMessageId: 'm1',
    subject: 'Re: VAT question',
    bodyText: 'Thanks Ada — here is the position.',
    status: 'pending',
  };

  beforeEach(() => {
    prismaMock.mailAiReplyDraft.findFirst.mockResolvedValue(pendingDraft);
    prismaMock.mailMessage.findFirst.mockResolvedValue(inbound);
  });

  it('sends when the conditional claim wins', async () => {
    prismaMock.mailAiReplyDraft.updateMany.mockResolvedValue({ count: 1 });
    const result = await approveDraft('t1', 'd1', 'u1');
    expect(result.sent).toBe(true);
    expect(prismaMock.mailAiReplyDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'd1', tenantId: 't1', status: 'pending' } })
    );
  });

  it('rejects as already-decided when a concurrent approval already claimed the row', async () => {
    prismaMock.mailAiReplyDraft.updateMany.mockResolvedValue({ count: 0 });
    await expect(approveDraft('t1', 'd1', 'u1')).rejects.toMatchObject({
      code: 'DRAFT_ALREADY_DECIDED',
    });
    expect(sendMailboxMessageMock).not.toHaveBeenCalled();
  });

  it('a thrown send error leaves the draft failed (not pending) with the error text stored, so no retry can auto-send it', async () => {
    sendMailboxMessageMock.mockRejectedValue(new Error('write ECONNRESET'));
    await expect(approveDraft('t1', 'd1', 'u1')).rejects.toThrow('write ECONNRESET');
    const finalUpdate = prismaMock.mailAiReplyDraft.update.mock.calls.at(-1)[0];
    expect(finalUpdate.data.status).toBe('failed');
    expect(finalUpdate.data.status).not.toBe('pending');
    expect(finalUpdate.data.error).toContain('write ECONNRESET');
  });

  it('a returned { sent: false } still leaves the draft pending for a legitimate retry', async () => {
    sendMailboxMessageMock.mockResolvedValue({ dto: null, sent: false, error: 'Send failed' });
    const result = await approveDraft('t1', 'd1', 'u1');
    expect(result.sent).toBe(false);
    const finalUpdate = prismaMock.mailAiReplyDraft.update.mock.calls.at(-1)[0];
    expect(finalUpdate.data.status).toBe('pending');
  });
});

describe('dismissDraft', () => {
  it('succeeds on a failed draft', async () => {
    prismaMock.mailAiReplyDraft.findFirst.mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: 'failed',
    });
    await expect(dismissDraft('t1', 'd1', 'u1')).resolves.toBeUndefined();
    expect(prismaMock.mailAiReplyDraft.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'dismissed' }) })
    );
  });

  it('succeeds on a stranded sending draft', async () => {
    prismaMock.mailAiReplyDraft.findFirst.mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: 'sending',
    });
    await expect(dismissDraft('t1', 'd1', 'u1')).resolves.toBeUndefined();
    expect(prismaMock.mailAiReplyDraft.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'dismissed' }) })
    );
  });

  it('still 409s on a draft that already sent', async () => {
    prismaMock.mailAiReplyDraft.findFirst.mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: 'sent',
    });
    await expect(dismissDraft('t1', 'd1', 'u1')).rejects.toMatchObject({
      code: 'DRAFT_ALREADY_DECIDED',
    });
    expect(prismaMock.mailAiReplyDraft.update).not.toHaveBeenCalled();
  });

  it('still works when the tenant has since turned the feature off', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(settings({ enabled: false, mode: 'draft' }));
    prismaMock.mailAiReplyDraft.findFirst.mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: 'pending',
    });
    await expect(dismissDraft('t1', 'd1', 'u1')).resolves.toBeUndefined();
    expect(prismaMock.mailAiReplyDraft.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'dismissed' }) })
    );
  });
});

describe('listPendingDrafts — off means off', () => {
  it('returns pending drafts when the tenant has AI replies enabled', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(settings({ enabled: true, mode: 'draft' }));
    prismaMock.mailAiReplyDraft.findMany.mockResolvedValue([
      {
        id: 'd1',
        conversationId: 'c1',
        inboundMessageId: 'm1',
        subject: 'Re: VAT question',
        bodyText: 'body',
        status: 'pending',
        createdAt: new Date(),
      },
    ]);
    const drafts = await listPendingDrafts('t1');
    expect(drafts).toHaveLength(1);
  });

  it('returns no drafts when the tenant has turned AI replies off, without querying drafts', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(settings({ enabled: false, mode: 'draft' }));
    const drafts = await listPendingDrafts('t1');
    expect(drafts).toEqual([]);
    expect(prismaMock.mailAiReplyDraft.findMany).not.toHaveBeenCalled();
  });
});

describe('approveDraft — off means off', () => {
  it('refuses to send once the tenant has turned AI replies off', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(settings({ enabled: false, mode: 'draft' }));
    await expect(approveDraft('t1', 'd1', 'u1')).rejects.toMatchObject({
      code: 'MAIL_AUTOREPLY_DISABLED',
    });
    expect(sendMailboxMessageMock).not.toHaveBeenCalled();
    expect(prismaMock.mailAiReplyDraft.updateMany).not.toHaveBeenCalled();
  });
});
