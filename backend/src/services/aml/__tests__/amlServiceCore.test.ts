/**
 * amlService behaviour after the R2.1 provider refactor — stub/live initiation
 * and webhook status + lifecycle mapping are unchanged.
 */

const clientFindFirst = jest.fn();
const clientUpdate = jest.fn(async () => ({}));
const activityCreate = jest.fn(async () => ({}));
const tenantFindUnique = jest.fn();
const invoiceItemsCreate = jest.fn(async () => ({ id: 'ii_1' }));

jest.mock('../../../config/database.js', () => ({
  prisma: {
    client: { findFirst: clientFindFirst, update: clientUpdate },
    activityLog: { create: activityCreate },
    tenant: { findUnique: tenantFindUnique },
  },
}));
jest.mock('../../../config/logger.js', () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock('../../../config/stripe.js', () => ({
  stripe: { invoiceItems: { create: invoiceItemsCreate } },
}));

import { initiateAmlCheck, processAmlWebhook, resolveAmlProvider } from '../../amlService.js';

const ENV_KEYS = [
  'SMARTSEARCH_API_KEY',
  'SMARTSEARCH_API_URL',
  'CREDITSAFE_API_KEY',
  'CREDITSAFE_API_URL',
  'AML_BILLING_ENABLED',
  'AML_CHECK_PRICE_PENCE',
] as const;
const savedEnv: Record<string, string | undefined> = {};

const baseClient = {
  id: 'client-1',
  tenantId: 'tenant-1',
  name: 'Acme Ltd',
  contactName: 'Jane Doe',
  contactEmail: 'jane@acme.test',
  amlSubmissionData: null,
  amlCompletedAt: null,
  lifecycleStage: 'PROPOSAL_ACCEPTED',
};

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  clientFindFirst.mockResolvedValue({ ...baseClient });
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('resolveAmlProvider (legacy name surface)', () => {
  it('returns provider names with the original precedence', () => {
    expect(resolveAmlProvider()).toBe('stub');
    process.env.CREDITSAFE_API_KEY = 'sk_cs';
    expect(resolveAmlProvider()).toBe('creditsafe');
    process.env.SMARTSEARCH_API_KEY = 'sk_ss';
    expect(resolveAmlProvider()).toBe('smartsearch');
    expect(resolveAmlProvider('stub')).toBe('stub');
  });
});

describe('initiateAmlCheck', () => {
  it('runs the stub provider when nothing is configured (no fetch, no billing)', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await initiateAmlCheck({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      initiatedByUserId: 'user-1',
    });

    expect(result.provider).toBe('stub');
    expect(result.isStub).toBe(true);
    expect(result.amlStatus).toBe('PENDING');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(invoiceItemsCreate).not.toHaveBeenCalled();

    expect(clientUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amlStatus: 'PENDING', lifecycleStage: 'AML_PENDING' }),
      })
    );
    expect(activityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'AML_CHECK_INITIATED',
          metadata: expect.stringContaining('"isStub":true'),
        }),
      })
    );
  });

  it('submits to the configured provider and stores its reference', async () => {
    process.env.SMARTSEARCH_API_KEY = 'sk_ss';
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'ss_live_1' }),
    })) as unknown as typeof fetch;

    const result = await initiateAmlCheck({ tenantId: 'tenant-1', clientId: 'client-1' });

    expect(result.provider).toBe('smartsearch');
    expect(result.isStub).toBe(false);
    expect(result.amlProviderRef).toBe('ss_live_1');
    expect(clientUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amlProviderRef: 'ss_live_1' }),
      })
    );
    // Billing flag off — no invoice item even for a live check.
    expect(invoiceItemsCreate).not.toHaveBeenCalled();
  });

  it('creates a Stripe invoice item for live checks when billing is enabled', async () => {
    process.env.SMARTSEARCH_API_KEY = 'sk_ss';
    process.env.AML_BILLING_ENABLED = 'true';
    process.env.AML_CHECK_PRICE_PENCE = '150';
    tenantFindUnique.mockResolvedValue({ stripeCustomerId: 'cus_1' });
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'ss_live_2' }),
    })) as unknown as typeof fetch;

    await initiateAmlCheck({ tenantId: 'tenant-1', clientId: 'client-1' });

    expect(invoiceItemsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_1', amount: 150, currency: 'gbp' })
    );
  });

  it('throws a Client not found error for unknown clients', async () => {
    clientFindFirst.mockResolvedValue(null);
    await expect(initiateAmlCheck({ tenantId: 't', clientId: 'nope' })).rejects.toThrow(
      'Client not found'
    );
  });
});

describe('processAmlWebhook', () => {
  it('maps clear → CLEAR and advances AML_PENDING → AML_COMPLETE', async () => {
    clientFindFirst.mockResolvedValue({ ...baseClient, lifecycleStage: 'AML_PENDING' });

    const result = await processAmlWebhook({ providerRef: 'ref-1', status: 'clear' });

    expect(result).toEqual({ updated: true, clientId: 'client-1', amlStatus: 'CLEAR' });
    expect(clientUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amlStatus: 'CLEAR',
          lifecycleStage: 'AML_COMPLETE',
          amlCompletedAt: expect.any(Date),
        }),
      })
    );
    expect(activityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'AML_CHECK_COMPLETED' }),
      })
    );
  });

  it('maps refer → REFER and moves PROPOSAL_ACCEPTED → AML_PENDING', async () => {
    const result = await processAmlWebhook({ providerRef: 'ref-2', status: 'refer' });

    expect(result.amlStatus).toBe('REFER');
    expect(clientUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amlStatus: 'REFER', lifecycleStage: 'AML_PENDING' }),
      })
    );
  });

  it('maps failed → FAILED and keeps unrelated lifecycle stages unchanged', async () => {
    clientFindFirst.mockResolvedValue({ ...baseClient, lifecycleStage: 'ONGOING' });

    const result = await processAmlWebhook({ providerRef: 'ref-3', status: 'failed' });

    expect(result.amlStatus).toBe('FAILED');
    expect(clientUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amlStatus: 'FAILED', lifecycleStage: 'ONGOING' }),
      })
    );
  });

  it('returns updated:false for an unknown providerRef', async () => {
    clientFindFirst.mockResolvedValue(null);

    const result = await processAmlWebhook({ providerRef: 'unknown', status: 'clear' });

    expect(result).toEqual({ updated: false });
    expect(clientUpdate).not.toHaveBeenCalled();
  });
});
