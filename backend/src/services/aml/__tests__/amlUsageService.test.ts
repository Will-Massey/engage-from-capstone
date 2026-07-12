/**
 * R2.4 per-check metering — usage aggregation from AML_CHECK_INITIATED logs
 * (stub excluded, month-windowed) and the billing hook, which must be a
 * strict no-op unless AML_BILLING_ENABLED=true and AML_CHECK_PRICE_PENCE>0.
 */

const activityFindMany = jest.fn();
const tenantFindUnique = jest.fn();
const invoiceItemsCreate = jest.fn(async () => ({ id: 'ii_1' }));
const loggerWarn = jest.fn();
const loggerError = jest.fn();

jest.mock('../../../config/database.js', () => ({
  prisma: {
    activityLog: { findMany: activityFindMany },
    tenant: { findUnique: tenantFindUnique },
  },
}));
jest.mock('../../../config/logger.js', () => ({
  __esModule: true,
  default: { warn: loggerWarn, error: loggerError, info: jest.fn() },
}));
jest.mock('../../../config/stripe.js', () => ({
  stripe: { invoiceItems: { create: invoiceItemsCreate } },
}));

import { getAmlUsage, recordAmlCheckUsage } from '../amlUsageService.js';

const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = ['AML_BILLING_ENABLED', 'AML_CHECK_PRICE_PENCE'] as const;

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  activityFindMany.mockResolvedValue([]);
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

function meta(provider: string, isStub = false): { metadata: string } {
  return { metadata: JSON.stringify({ provider, amlProviderRef: `${provider}_1`, isStub }) };
}

describe('getAmlUsage', () => {
  it('aggregates provider-backed checks and excludes stub/demo checks', async () => {
    activityFindMany.mockResolvedValue([
      meta('smartsearch'),
      meta('smartsearch'),
      meta('creditsafe'),
      meta('stub', true),
      { metadata: 'not-json' },
      { metadata: null },
    ]);

    const usage = await getAmlUsage('tenant-1', '2026-06');

    expect(usage.totalChecks).toBe(3);
    expect(usage.checksByProvider).toEqual({ smartsearch: 2, creditsafe: 1 });
    expect(usage.month).toBe('2026-06');
    expect(usage.perCheckPricePence).toBe(0);
    expect(usage.billingEnabled).toBe(false);
  });

  it('windows the query to the requested month', async () => {
    await getAmlUsage('tenant-1', '2026-06');

    expect(activityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          action: 'AML_CHECK_INITIATED',
          createdAt: {
            gte: new Date(2026, 5, 1),
            lt: new Date(2026, 6, 1),
          },
        }),
      })
    );
  });

  it('defaults to the current month when no month is given', async () => {
    const now = new Date();
    const expectedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const usage = await getAmlUsage('tenant-1');

    expect(usage.month).toBe(expectedMonth);
    expect(activityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: new Date(now.getFullYear(), now.getMonth(), 1),
            lt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
          },
        }),
      })
    );
  });

  it('reports the configured price and billing flag', async () => {
    process.env.AML_BILLING_ENABLED = 'true';
    process.env.AML_CHECK_PRICE_PENCE = '150';

    const usage = await getAmlUsage('tenant-1');

    expect(usage.perCheckPricePence).toBe(150);
    expect(usage.billingEnabled).toBe(true);
  });
});

describe('recordAmlCheckUsage', () => {
  it('is a no-op when billing is disabled', async () => {
    process.env.AML_CHECK_PRICE_PENCE = '150';

    await recordAmlCheckUsage('tenant-1', 'smartsearch', 'client-1');

    expect(tenantFindUnique).not.toHaveBeenCalled();
    expect(invoiceItemsCreate).not.toHaveBeenCalled();
  });

  it('is a no-op when no per-check price is configured', async () => {
    process.env.AML_BILLING_ENABLED = 'true';

    await recordAmlCheckUsage('tenant-1', 'smartsearch', 'client-1');

    expect(invoiceItemsCreate).not.toHaveBeenCalled();
  });

  it('never bills stub checks', async () => {
    process.env.AML_BILLING_ENABLED = 'true';
    process.env.AML_CHECK_PRICE_PENCE = '150';

    await recordAmlCheckUsage('tenant-1', 'stub', 'client-1');

    expect(invoiceItemsCreate).not.toHaveBeenCalled();
  });

  it('creates an invoice item against the tenant platform customer when enabled', async () => {
    process.env.AML_BILLING_ENABLED = 'true';
    process.env.AML_CHECK_PRICE_PENCE = '150';
    tenantFindUnique.mockResolvedValue({ stripeCustomerId: 'cus_42' });

    await recordAmlCheckUsage('tenant-1', 'creditsafe', 'client-1');

    expect(invoiceItemsCreate).toHaveBeenCalledWith({
      customer: 'cus_42',
      amount: 150,
      currency: 'gbp',
      description: 'AML check (creditsafe)',
      metadata: {
        tenantId: 'tenant-1',
        clientId: 'client-1',
        provider: 'creditsafe',
        feature: 'aml_check',
      },
    });
  });

  it('logs NOT_CONFIGURED and skips when the tenant has no Stripe customer', async () => {
    process.env.AML_BILLING_ENABLED = 'true';
    process.env.AML_CHECK_PRICE_PENCE = '150';
    tenantFindUnique.mockResolvedValue({ stripeCustomerId: null });

    await recordAmlCheckUsage('tenant-1', 'smartsearch', 'client-1');

    expect(invoiceItemsCreate).not.toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining('NOT_CONFIGURED'));
  });

  it('never throws when Stripe rejects the invoice item', async () => {
    process.env.AML_BILLING_ENABLED = 'true';
    process.env.AML_CHECK_PRICE_PENCE = '150';
    tenantFindUnique.mockResolvedValue({ stripeCustomerId: 'cus_42' });
    invoiceItemsCreate.mockRejectedValueOnce(new Error('stripe down'));

    await expect(
      recordAmlCheckUsage('tenant-1', 'smartsearch', 'client-1')
    ).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalled();
  });
});
