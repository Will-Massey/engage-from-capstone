/**
 * POST /api/proposals/:id/archive — staff archive for test/superseded records.
 * Archiving is the sanctioned alternative to deletion for proposals whose
 * e-sign audit trail must be preserved: status → ARCHIVED, archivedAt stamped,
 * live share links revoked, activity logged. Signature rows are never touched.
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

jest.mock('../../../middleware/subscription.js', () => ({
  requireActiveSubscription: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

const proposalFindFirst = jest.fn();
const proposalUpdate = jest.fn();
const activityLogCreate = jest.fn();
const revokeShareableLink = jest.fn();

jest.mock('../../../config/database.js', () => ({
  prisma: {
    proposal: { findFirst: proposalFindFirst, update: proposalUpdate },
    activityLog: { create: activityLogCreate },
  },
}));

jest.mock('../../../services/proposalSharingService.js', () => ({
  revokeShareableLink: (...args: unknown[]) => revokeShareableLink(...args),
  getClientByPortalToken: jest.fn(),
}));

jest.mock('../../../services/pdfGenerator.js', () => ({
  PDFGenerator: class {},
}));

jest.mock('../../../config/sentry.js', () => ({
  captureException: jest.fn(),
  initSentry: jest.fn(),
  Sentry: {},
}));

import lifecycleRoutes from '../lifecycle.js';
import { errorHandler } from '../../../middleware/errorHandler.js';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/proposals', lifecycleRoutes);
  a.use(errorHandler);
  return a;
}

const baseProposal = {
  id: 'p1',
  tenantId: 't1',
  title: 'Old test proposal',
  status: 'ACCEPTED',
  shareToken: 'tok',
  publicAccessEnabled: true,
  client: { name: 'Capstone Software Ltd' },
};

beforeEach(() => {
  proposalFindFirst.mockReset();
  proposalUpdate
    .mockReset()
    .mockImplementation(({ data }) => Promise.resolve({ ...baseProposal, ...data }));
  activityLogCreate.mockReset().mockResolvedValue({});
  revokeShareableLink.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/proposals/:id/archive', () => {
  it('archives an ACCEPTED proposal: status, archivedAt, share revoked, activity logged', async () => {
    proposalFindFirst.mockResolvedValue(baseProposal);

    const res = await request(app()).post('/api/proposals/p1/archive');

    expect(res.status).toBe(200);
    expect(proposalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({
          status: 'ARCHIVED',
          archivedAt: expect.any(Date),
        }),
      })
    );
    expect(revokeShareableLink).toHaveBeenCalledWith('p1');
    expect(activityLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'PROPOSAL_ARCHIVED', entityId: 'p1' }),
      })
    );
  });

  it('does not revoke sharing when no live link exists', async () => {
    proposalFindFirst.mockResolvedValue({
      ...baseProposal,
      shareToken: null,
      publicAccessEnabled: false,
    });

    const res = await request(app()).post('/api/proposals/p1/archive');

    expect(res.status).toBe(200);
    expect(revokeShareableLink).not.toHaveBeenCalled();
  });

  it('rejects an already-archived proposal', async () => {
    proposalFindFirst.mockResolvedValue({ ...baseProposal, status: 'ARCHIVED' });

    const res = await request(app()).post('/api/proposals/p1/archive');

    expect(res.status).toBe(400);
    expect(proposalUpdate).not.toHaveBeenCalled();
  });

  it('404s outside the tenant', async () => {
    proposalFindFirst.mockResolvedValue(null);

    const res = await request(app()).post('/api/proposals/p1/archive');

    expect(res.status).toBe(404);
    expect(proposalUpdate).not.toHaveBeenCalled();
  });
});
