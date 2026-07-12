const tenantFindMany = jest.fn();

jest.mock('../../config/database.js', () => ({
  prisma: {
    tenant: { findMany: tenantFindMany },
  },
}));

const runClaraDraftingForTenant = jest.fn();
jest.mock('../../services/claraAgenticService.js', () => ({
  runClaraDraftingForTenant: (...args: unknown[]) => runClaraDraftingForTenant(...args),
}));

const loggerError = jest.fn();
jest.mock('../../config/logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: (...args: unknown[]) => loggerError(...args),
  },
}));

import { runClaraAgenticDrafting } from '../claraAgenticDrafting.js';
import { JOB_LOCKS } from '../../utils/jobLock.js';

const NOW = new Date('2026-07-12T02:00:00.000Z');

function summary(tenantId: string, overrides: Record<string, number> = {}) {
  return {
    tenantId,
    enabled: true,
    signalDrafts: 1,
    renewalDrafts: 2,
    skipped: 1,
    errors: 0,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('claraAgenticDrafting job', () => {
  it('claims the reserved advisory-lock key 4107, distinct from every other job', () => {
    expect(JOB_LOCKS.claraAgenticDrafting).toBe(4107);
    const values = Object.values(JOB_LOCKS);
    expect(new Set(values).size).toBe(values.length);
  });

  it('iterates active tenants only and aggregates per-tenant summaries', async () => {
    tenantFindMany.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);
    runClaraDraftingForTenant
      .mockResolvedValueOnce(summary('t1'))
      .mockResolvedValueOnce(summary('t2', { signalDrafts: 3, renewalDrafts: 0 }));

    const result = await runClaraAgenticDrafting(NOW);

    expect(tenantFindMany).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { id: true },
    });
    expect(runClaraDraftingForTenant).toHaveBeenCalledTimes(2);
    expect(runClaraDraftingForTenant).toHaveBeenNthCalledWith(1, 't1', NOW);
    expect(runClaraDraftingForTenant).toHaveBeenNthCalledWith(2, 't2', NOW);
    expect(result).toEqual({
      tenants: 2,
      signalDrafts: 4,
      renewalDrafts: 2,
      skipped: 2,
      errors: 0,
    });
  });

  it('isolates a per-tenant failure and keeps processing the rest', async () => {
    tenantFindMany.mockResolvedValue([{ id: 't1' }, { id: 't2' }, { id: 't3' }]);
    runClaraDraftingForTenant
      .mockResolvedValueOnce(summary('t1'))
      .mockRejectedValueOnce(new Error('tenant t2 exploded'))
      .mockResolvedValueOnce(summary('t3'));

    const result = await runClaraAgenticDrafting(NOW);

    expect(runClaraDraftingForTenant).toHaveBeenCalledTimes(3);
    expect(result.tenants).toBe(2); // successful tenants only
    expect(result.errors).toBe(1);
    expect(result.signalDrafts).toBe(2);
    expect(loggerError).toHaveBeenCalledWith(expect.stringContaining('t2'), expect.any(Error));
  });
});
