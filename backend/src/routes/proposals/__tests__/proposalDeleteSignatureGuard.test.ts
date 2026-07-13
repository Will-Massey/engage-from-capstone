/**
 * E-sign audit-trail immutability at the route layer: DELETE /api/proposals/:id
 * must reject (409 SIGNATURES_EXIST) any proposal that has recorded signatures,
 * so signatures can never be cascade-destroyed. The existing ACCEPTED guard and
 * the clean-delete path for signature-free proposals are also locked.
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

const proposalFindFirst = jest.fn();
const proposalDelete = jest.fn();
const signatureCount = jest.fn();
const activityLogCreate = jest.fn();

jest.mock('../../../config/database.js', () => ({
  prisma: {
    proposal: { findFirst: proposalFindFirst, delete: proposalDelete },
    proposalSignature: { count: signatureCount },
    activityLog: { create: activityLogCreate },
  },
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
  proposalFindFirst.mockReset();
  proposalDelete.mockReset().mockResolvedValue({});
  signatureCount.mockReset();
  activityLogCreate.mockReset().mockResolvedValue({});
});

describe('DELETE /api/proposals/:id signature guard', () => {
  it('rejects with 409 when the proposal has recorded signatures', async () => {
    proposalFindFirst.mockResolvedValue({ id: 'p1', tenantId: 't1', title: 'T', status: 'SENT' });
    signatureCount.mockResolvedValue(1);

    const res = await request(app()).delete('/api/proposals/p1');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SIGNATURES_EXIST');
    expect(proposalDelete).not.toHaveBeenCalled();
  });

  it('still rejects an ACCEPTED proposal (existing guard preserved)', async () => {
    proposalFindFirst.mockResolvedValue({
      id: 'p1',
      tenantId: 't1',
      title: 'T',
      status: 'ACCEPTED',
    });

    const res = await request(app()).delete('/api/proposals/p1');

    expect(res.status).toBe(400);
    expect(proposalDelete).not.toHaveBeenCalled();
    expect(signatureCount).not.toHaveBeenCalled();
  });

  it('deletes a signature-free proposal', async () => {
    proposalFindFirst.mockResolvedValue({ id: 'p1', tenantId: 't1', title: 'T', status: 'DRAFT' });
    signatureCount.mockResolvedValue(0);

    const res = await request(app()).delete('/api/proposals/p1');

    expect(res.status).toBe(200);
    expect(proposalDelete).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });
});
