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
  },
  client: { findFirst: jest.fn() },
  job: { findMany: jest.fn() },
  proposal: { findMany: jest.fn() },
  documentRequest: { findMany: jest.fn() },
};
jest.mock('../../../config/database.js', () => ({ prisma: prismaMock }));

const chatCompletionMock = jest.fn();
const checkAiTokenBudgetMock = jest.fn();
jest.mock('../../ai/aiClient.js', () => ({
  chatCompletion: (...a: unknown[]) => chatCompletionMock(...a),
  checkAiTokenBudget: (...a: unknown[]) => checkAiTokenBudgetMock(...a),
}));

const sendMailboxMessageMock = jest.fn();
jest.mock('../../mailboxService.js', () => ({
  sendMailboxMessage: (...a: unknown[]) => sendMailboxMessageMock(...a),
  getThread: jest.fn().mockResolvedValue([]),
}));

import { processNewInboundMessages } from '../index.js';

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
  prismaMock.client.findFirst.mockResolvedValue({
    id: 'cl1',
    name: 'Acme Ltd',
    contactName: 'Ada',
  });
  prismaMock.job.findMany.mockResolvedValue([]);
  prismaMock.proposal.findMany.mockResolvedValue([]);
  prismaMock.documentRequest.findMany.mockResolvedValue([]);
  checkAiTokenBudgetMock.mockResolvedValue({ withinBudget: true });
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
    expect(prismaMock.mailAiReplyDraft.create.mock.calls[0][0].data.status).toBe('pending');
    expect(sendMailboxMessageMock).not.toHaveBeenCalled();
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
