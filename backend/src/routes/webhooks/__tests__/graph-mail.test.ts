/**
 * Task 4 — Graph webhook receiver: validation handshake, clientState
 * validation, and fire-and-forget sync dispatch.
 */
import express from 'express';
import request from 'supertest';

const mailboxSyncStateFindFirst = jest.fn();
jest.mock('../../../config/database.js', () => ({
  prisma: {
    mailboxSyncState: { findFirst: (...args: unknown[]) => mailboxSyncStateFindFirst(...args) },
  },
}));

const syncMailboxMock = jest.fn();
jest.mock('../../../services/mailboxService.js', () => ({
  syncMailbox: (...args: unknown[]) => syncMailboxMock(...args),
}));

import graphMailWebhookRouter from '../graph-mail.js';
import { errorHandler } from '../../../middleware/errorHandler.js';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/webhooks/graph-mail', graphMailWebhookRouter);
  a.use(errorHandler);
  return a;
}

beforeEach(() => {
  jest.clearAllMocks();
  syncMailboxMock.mockResolvedValue({ ok: true });
});

describe('POST /api/webhooks/graph-mail', () => {
  it('echoes the validationToken as text/plain 200 for the Graph handshake', async () => {
    const res = await request(app())
      .post('/api/webhooks/graph-mail')
      .query({ validationToken: 'handshake-token-123' })
      .send();

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toBe('handshake-token-123');
    expect(mailboxSyncStateFindFirst).not.toHaveBeenCalled();
    expect(syncMailboxMock).not.toHaveBeenCalled();
  });

  it('resolves the tenant by clientState and fires syncMailbox, responding 202 without waiting for it', async () => {
    mailboxSyncStateFindFirst.mockResolvedValue({ tenantId: 'tenant-1' });
    let resolveSync: () => void = () => {};
    syncMailboxMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSync = () => resolve({ ok: true });
      })
    );

    const res = await request(app())
      .post('/api/webhooks/graph-mail')
      .send({ value: [{ subscriptionId: 'sub-1', clientState: 'good-client-state' }] });

    expect(res.status).toBe(202);
    expect(mailboxSyncStateFindFirst).toHaveBeenCalledWith({ where: { clientState: 'good-client-state' } });
    expect(syncMailboxMock).toHaveBeenCalledWith('tenant-1');
    resolveSync();
  });

  it('drops the notification with 202 and does not sync when clientState is missing', async () => {
    const res = await request(app())
      .post('/api/webhooks/graph-mail')
      .send({ value: [{ subscriptionId: 'sub-1' }] });

    expect(res.status).toBe(202);
    expect(mailboxSyncStateFindFirst).not.toHaveBeenCalled();
    expect(syncMailboxMock).not.toHaveBeenCalled();
  });

  it('drops the notification with 202 and does not sync when clientState matches no tenant', async () => {
    mailboxSyncStateFindFirst.mockResolvedValue(null);

    const res = await request(app())
      .post('/api/webhooks/graph-mail')
      .send({ value: [{ subscriptionId: 'sub-1', clientState: 'unknown-client-state' }] });

    expect(res.status).toBe(202);
    expect(syncMailboxMock).not.toHaveBeenCalled();
  });

  it('processes each notification in a batch independently', async () => {
    mailboxSyncStateFindFirst.mockImplementation(({ where }: { where: { clientState: string } }) =>
      Promise.resolve(where.clientState === 'cs-a' ? { tenantId: 'tenant-a' } : null)
    );

    const res = await request(app())
      .post('/api/webhooks/graph-mail')
      .send({
        value: [
          { subscriptionId: 'sub-1', clientState: 'cs-a' },
          { subscriptionId: 'sub-2' }, // missing clientState — dropped
          { subscriptionId: 'sub-3', clientState: 'cs-unknown' }, // no tenant match — dropped
        ],
      });

    expect(res.status).toBe(202);
    expect(syncMailboxMock).toHaveBeenCalledTimes(1);
    expect(syncMailboxMock).toHaveBeenCalledWith('tenant-a');
  });

  it('responds 202 even when no value array is present', async () => {
    const res = await request(app()).post('/api/webhooks/graph-mail').send({});

    expect(res.status).toBe(202);
    expect(syncMailboxMock).not.toHaveBeenCalled();
  });

  it('still responds 202 and does not sync when the clientState lookup itself throws (DB hiccup)', async () => {
    mailboxSyncStateFindFirst.mockRejectedValue(new Error('connection terminated'));

    const res = await request(app())
      .post('/api/webhooks/graph-mail')
      .send({ value: [{ subscriptionId: 'sub-1', clientState: 'good-client-state' }] });

    expect(res.status).toBe(202);
    expect(syncMailboxMock).not.toHaveBeenCalled();
  });
});
