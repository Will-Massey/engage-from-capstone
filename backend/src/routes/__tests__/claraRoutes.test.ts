import express from 'express';
import request from 'supertest';

type Role = 'ADMIN' | 'PARTNER' | 'MD' | 'MANAGER' | 'SENIOR' | 'JUNIOR';
let currentRole: Role = 'ADMIN';

jest.mock('../../middleware/auth.js', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const r = req as express.Request & { tenantId?: string; user?: unknown };
    r.tenantId = 't1';
    r.user = {
      id: 'u1',
      email: 'a@x.com',
      firstName: 'A',
      lastName: 'B',
      role: currentRole,
      tenantId: 't1',
    };
    next();
  },
  authorize:
    (...roles: string[]) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const role = (req as express.Request & { user?: { role?: string } }).user?.role;
      if (role && roles.includes(role)) return next();
      res.status(403).json({ success: false, error: { message: 'Forbidden' } });
    },
}));

const runClaraDraftingForTenant = jest.fn();
jest.mock('../../services/claraAgenticService.js', () => ({
  runClaraDraftingForTenant: (...args: unknown[]) => runClaraDraftingForTenant(...args),
}));

jest.mock('../../config/sentry.js', () => ({
  captureException: jest.fn(),
  initSentry: jest.fn(),
  Sentry: {},
}));

import claraRoutes from '../clara.js';
import { errorHandler } from '../../middleware/errorHandler.js';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/clara', claraRoutes);
  a.use(errorHandler);
  return a;
}

beforeEach(() => {
  jest.clearAllMocks();
  currentRole = 'ADMIN';
});

describe('POST /api/clara/run-drafting', () => {
  it('runs the tenant drafting pass and returns the summary', async () => {
    runClaraDraftingForTenant.mockResolvedValue({
      tenantId: 't1',
      enabled: true,
      signalDrafts: 2,
      renewalDrafts: 1,
      skipped: 3,
      errors: 0,
    });

    const res = await request(app()).post('/api/clara/run-drafting').send({});

    expect(res.status).toBe(200);
    expect(runClaraDraftingForTenant).toHaveBeenCalledWith('t1');
    expect(res.body.data).toMatchObject({ signalDrafts: 2, renewalDrafts: 1 });
    expect(res.body.message).toContain('3 proposal(s)');
  });

  it('reports when the tenant has not opted in', async () => {
    runClaraDraftingForTenant.mockResolvedValue({
      tenantId: 't1',
      enabled: false,
      signalDrafts: 0,
      renewalDrafts: 0,
      skipped: 0,
      errors: 0,
    });

    const res = await request(app()).post('/api/clara/run-drafting').send({});

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('switched off');
  });

  it.each(['SENIOR', 'JUNIOR', 'MD'] as const)('denies %s role', async (role) => {
    currentRole = role;

    const res = await request(app()).post('/api/clara/run-drafting').send({});

    expect(res.status).toBe(403);
    expect(runClaraDraftingForTenant).not.toHaveBeenCalled();
  });

  it.each(['ADMIN', 'PARTNER', 'MANAGER'] as const)('allows %s role', async (role) => {
    currentRole = role;
    runClaraDraftingForTenant.mockResolvedValue({
      tenantId: 't1',
      enabled: true,
      signalDrafts: 0,
      renewalDrafts: 0,
      skipped: 0,
      errors: 0,
    });

    const res = await request(app()).post('/api/clara/run-drafting').send({});

    expect(res.status).toBe(200);
  });
});
