/**
 * R5.1 — deferred archive on human approval of a Clara-drafted renewal.
 * When a renewal created with archiveOriginal:false is approved, the still-
 * ACCEPTED original is archived exactly once; manually created renewals
 * (original already ARCHIVED at draft time) and non-renewals are no-ops.
 */
import express from 'express';
import request from 'supertest';

type Role = 'ADMIN' | 'PARTNER' | 'MD' | 'MANAGER' | 'SENIOR' | 'JUNIOR';
let currentRole: Role = 'PARTNER';

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

const proposalFindFirst = jest.fn();
const proposalUpdate = jest.fn();
const activityLogCreate = jest.fn();
const userFindUnique = jest.fn();

jest.mock('../../config/database.js', () => ({
  prisma: {
    proposal: { findFirst: proposalFindFirst, update: proposalUpdate },
    activityLog: { create: activityLogCreate },
    user: { findUnique: userFindUnique },
  },
}));

const archiveSupersededOriginal = jest.fn();
jest.mock('../../services/renewalProposalService.js', () => ({
  archiveSupersededOriginal: (...args: unknown[]) => archiveSupersededOriginal(...args),
}));

jest.mock('../../config/sentry.js', () => ({
  captureException: jest.fn(),
  initSentry: jest.fn(),
  Sentry: {},
}));

import approvalRoutes from '../proposals/approvals.js';
import { errorHandler } from '../../middleware/errorHandler.js';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/proposals', approvalRoutes);
  a.use(errorHandler);
  return a;
}

const PENDING_RENEWAL = {
  id: 'ren-1',
  tenantId: 't1',
  title: 'Annual Accounts (Renewal)',
  reference: 'PROP-REN',
  status: 'DRAFT',
  approvalStatus: 'PENDING',
  isRenewal: true,
  originalProposalId: 'orig-1',
};

const ACCEPTED_ORIGINAL = {
  id: 'orig-1',
  reference: 'PROP-ORIG',
  shareToken: 'tok-1',
  publicAccessEnabled: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  currentRole = 'PARTNER';
  proposalUpdate.mockImplementation(async (args) => ({
    ...PENDING_RENEWAL,
    ...args.data,
    id: args.where.id,
  }));
  activityLogCreate.mockResolvedValue({});
  archiveSupersededOriginal.mockResolvedValue(undefined);
});

describe('POST /api/proposals/:id/approve — deferred renewal archive', () => {
  it('archives a still-ACCEPTED original exactly once when approving a renewal', async () => {
    proposalFindFirst
      .mockResolvedValueOnce(PENDING_RENEWAL) // the proposal being approved
      .mockResolvedValueOnce(ACCEPTED_ORIGINAL); // the original, still ACCEPTED

    const res = await request(app()).post('/api/proposals/ren-1/approve').send({});

    expect(res.status).toBe(200);
    expect(proposalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ren-1' },
        data: expect.objectContaining({ approvalStatus: 'APPROVED', approvedById: 'u1' }),
      })
    );
    // The original lookup is guarded on status ACCEPTED (idempotency key)
    expect(proposalFindFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'orig-1', tenantId: 't1', status: 'ACCEPTED' },
      })
    );
    expect(archiveSupersededOriginal).toHaveBeenCalledTimes(1);
    expect(archiveSupersededOriginal).toHaveBeenCalledWith('t1', 'u1', ACCEPTED_ORIGINAL, {
      id: 'ren-1',
      reference: 'PROP-REN',
    });
  });

  it('does nothing extra for manually created renewals whose original is already ARCHIVED', async () => {
    proposalFindFirst.mockResolvedValueOnce(PENDING_RENEWAL).mockResolvedValueOnce(null); // status ACCEPTED filter excludes ARCHIVED originals

    const res = await request(app()).post('/api/proposals/ren-1/approve').send({});

    expect(res.status).toBe(200);
    expect(archiveSupersededOriginal).not.toHaveBeenCalled();
  });

  it('never looks up an original for non-renewal proposals', async () => {
    proposalFindFirst.mockResolvedValueOnce({
      ...PENDING_RENEWAL,
      isRenewal: false,
      originalProposalId: null,
    });
    proposalUpdate.mockResolvedValueOnce({
      ...PENDING_RENEWAL,
      isRenewal: false,
      originalProposalId: null,
      approvalStatus: 'APPROVED',
    });

    const res = await request(app()).post('/api/proposals/ren-1/approve').send({});

    expect(res.status).toBe(200);
    expect(proposalFindFirst).toHaveBeenCalledTimes(1);
    expect(archiveSupersededOriginal).not.toHaveBeenCalled();
  });

  it('cannot double-archive: a second approve fails on approvalStatus PENDING', async () => {
    proposalFindFirst.mockResolvedValueOnce({ ...PENDING_RENEWAL, approvalStatus: 'APPROVED' });

    const res = await request(app()).post('/api/proposals/ren-1/approve').send({});

    expect(res.status).toBe(400);
    expect(archiveSupersededOriginal).not.toHaveBeenCalled();
    expect(proposalUpdate).not.toHaveBeenCalled();
  });
});
