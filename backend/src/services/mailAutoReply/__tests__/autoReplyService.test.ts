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
}));

const sendMailboxMessageMock = jest.fn();
jest.mock('../../mailboxService.js', () => ({
  sendMailboxMessage: (...a: unknown[]) => sendMailboxMessageMock(...a),
  getThread: jest.fn().mockResolvedValue([]),
}));

import { processNewInboundMessages, approveDraft, dismissDraft } from '../index.js';

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
});
