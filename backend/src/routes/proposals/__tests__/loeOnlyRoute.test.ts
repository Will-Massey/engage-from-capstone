/**
 * POST /api/proposals/loe-only — engagement-letter-only draft. The service is
 * covered elsewhere; here we lock the route wiring: authz, zod validation, and
 * the flattened `{ ...proposal, clauseIds }` response the LoeOnlyModal consumes
 * via `res.data.id`.
 */
import express from 'express';
import request from 'supertest';

jest.mock('../../../middleware/auth.js', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const r = req as express.Request & { tenantId?: string; user?: unknown };
    r.tenantId = 't1';
    r.user = {
      id: 'u1',
      email: 'a@x.com',
      firstName: 'A',
      lastName: 'B',
      role: 'PARTNER',
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

jest.mock('../../../middleware/tierLimits.js', () => ({
  enforceTierLimit:
    () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next(),
}));

const createLoeOnlyProposal = jest.fn();
jest.mock('../../../services/loeOnlyProposalService.js', () => ({
  createLoeOnlyProposal: (...args: unknown[]) => createLoeOnlyProposal(...args),
}));

jest.mock('../../../config/sentry.js', () => ({
  captureException: jest.fn(),
  initSentry: jest.fn(),
  Sentry: {},
}));

import crudRoutes from '../crud.js';
import { errorHandler } from '../../../middleware/errorHandler.js';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/proposals', crudRoutes);
  a.use(errorHandler);
  return a;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/proposals/loe-only', () => {
  it('creates a draft and returns the proposal flattened with clauseIds', async () => {
    createLoeOnlyProposal.mockResolvedValue({
      proposal: { id: 'p1', title: 'Letter of engagement — Acme' },
      clauseIds: ['c1', 'c2'],
    });

    const res = await request(app())
      .post('/api/proposals/loe-only')
      .send({ clientId: 'client-1', serviceIds: ['s1'], title: 'Letter of engagement — Acme' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('p1');
    expect(res.body.data.clauseIds).toEqual(['c1', 'c2']);
    expect(createLoeOnlyProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        userId: 'u1',
        clientId: 'client-1',
        serviceIds: ['s1'],
      })
    );
  });

  it('rejects with 400 when no services are selected', async () => {
    const res = await request(app())
      .post('/api/proposals/loe-only')
      .send({ clientId: 'client-1', serviceIds: [] });

    expect(res.status).toBe(400);
    expect(createLoeOnlyProposal).not.toHaveBeenCalled();
  });
});
