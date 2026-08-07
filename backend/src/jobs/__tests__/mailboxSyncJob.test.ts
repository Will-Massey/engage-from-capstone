/**
 * Task 4 — mailboxSyncJob: iterates Gmail/Outlook/Microsoft365 tenants,
 * calls syncMailbox per tenant (sequential, per-tenant try/catch), and
 * renews the Graph webhook subscription when it's missing or near expiry.
 */

const tenantFindMany = jest.fn();
const mailboxSyncStateFindUnique = jest.fn();

jest.mock('../../config/database.js', () => ({
  prisma: {
    tenant: { findMany: (...args: unknown[]) => tenantFindMany(...args) },
    mailboxSyncState: { findUnique: (...args: unknown[]) => mailboxSyncStateFindUnique(...args) },
  },
}));

jest.mock('../../services/mailboxService.js', () => ({
  syncMailbox: jest.fn(),
  normalizeMailProvider: (raw: string | undefined | null) => {
    const p = (raw || '').toLowerCase();
    if (p === 'gmail') return 'GMAIL';
    if (p === 'outlook') return 'OUTLOOK';
    if (p === 'microsoft365' || p === 'microsoft_365' || p === 'ms365') return 'MICROSOFT365';
    return null;
  },
}));

jest.mock('../../services/mail/graphMailClient.js', () => ({
  ensureGraphSubscription: jest.fn(),
}));

import { runMailboxSyncJob } from '../mailboxSyncJob.js';
import { syncMailbox } from '../../services/mailboxService.js';
import { ensureGraphSubscription } from '../../services/mail/graphMailClient.js';

const syncMailboxMock = syncMailbox as jest.Mock;
const ensureGraphSubscriptionMock = ensureGraphSubscription as jest.Mock;

function tenant(id: string, provider: string | null) {
  return {
    id,
    settings: JSON.stringify({ email: provider ? { provider } : {} }),
  };
}

const ORIGINAL_EMAIL_DEV_LOG = process.env.EMAIL_DEV_LOG;

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.EMAIL_DEV_LOG;
  syncMailboxMock.mockResolvedValue({ imported: 0, updated: 0, ok: true, message: 'ok' });
  ensureGraphSubscriptionMock.mockResolvedValue({ ok: true });
  mailboxSyncStateFindUnique.mockResolvedValue(null);
});

afterAll(() => {
  if (ORIGINAL_EMAIL_DEV_LOG === undefined) delete process.env.EMAIL_DEV_LOG;
  else process.env.EMAIL_DEV_LOG = ORIGINAL_EMAIL_DEV_LOG;
});

describe('runMailboxSyncJob', () => {
  it('skips everything when EMAIL_DEV_LOG=true', async () => {
    process.env.EMAIL_DEV_LOG = 'true';
    tenantFindMany.mockResolvedValue([tenant('t1', 'gmail')]);

    const result = await runMailboxSyncJob();

    expect(tenantFindMany).not.toHaveBeenCalled();
    expect(syncMailboxMock).not.toHaveBeenCalled();
    expect(result.tenantsSynced).toBe(0);
  });

  it('skips unconnected tenants (no recognised email provider)', async () => {
    tenantFindMany.mockResolvedValue([tenant('t1', null), tenant('t2', 'gmail')]);

    const result = await runMailboxSyncJob();

    expect(syncMailboxMock).toHaveBeenCalledTimes(1);
    expect(syncMailboxMock).toHaveBeenCalledWith('t2');
    expect(result.tenantsSynced).toBe(1);
  });

  it('runs sequentially with per-tenant try/catch — one failure does not block the next tenant', async () => {
    tenantFindMany.mockResolvedValue([tenant('t1', 'gmail'), tenant('t2', 'outlook')]);
    syncMailboxMock.mockRejectedValueOnce(new Error('boom'));

    const result = await runMailboxSyncJob();

    expect(syncMailboxMock).toHaveBeenCalledTimes(2);
    expect(syncMailboxMock).toHaveBeenNthCalledWith(1, 't1');
    expect(syncMailboxMock).toHaveBeenNthCalledWith(2, 't2');
    expect(result.tenantsSynced).toBe(2);
  });

  it('never calls ensureGraphSubscription for Gmail tenants', async () => {
    tenantFindMany.mockResolvedValue([tenant('t1', 'gmail')]);

    await runMailboxSyncJob();

    expect(ensureGraphSubscriptionMock).not.toHaveBeenCalled();
  });

  it('renews the Graph subscription when none has been created yet', async () => {
    tenantFindMany.mockResolvedValue([tenant('t1', 'outlook')]);
    mailboxSyncStateFindUnique.mockResolvedValue(null);

    await runMailboxSyncJob();

    expect(ensureGraphSubscriptionMock).toHaveBeenCalledWith('t1');
  });

  it('renews the Graph subscription when it expires within the next hour', async () => {
    tenantFindMany.mockResolvedValue([tenant('t1', 'microsoft365')]);
    mailboxSyncStateFindUnique.mockResolvedValue({
      subscriptionExpiry: new Date(Date.now() + 30 * 60 * 1000),
    });

    await runMailboxSyncJob();

    expect(ensureGraphSubscriptionMock).toHaveBeenCalledWith('t1');
  });

  it('skips renewal when the subscription is comfortably valid', async () => {
    tenantFindMany.mockResolvedValue([tenant('t1', 'outlook')]);
    mailboxSyncStateFindUnique.mockResolvedValue({
      subscriptionExpiry: new Date(Date.now() + 6 * 60 * 60 * 1000),
    });

    await runMailboxSyncJob();

    expect(ensureGraphSubscriptionMock).not.toHaveBeenCalled();
  });

  it('logs and continues when ensureGraphSubscription itself throws', async () => {
    tenantFindMany.mockResolvedValue([tenant('t1', 'outlook')]);
    ensureGraphSubscriptionMock.mockRejectedValue(new Error('graph down'));

    const result = await runMailboxSyncJob();

    expect(result.tenantsSynced).toBe(1);
  });
});
