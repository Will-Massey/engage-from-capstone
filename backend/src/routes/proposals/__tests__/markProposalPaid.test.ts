/**
 * POST /api/proposals/:id/mark-paid and /mark-unpaid — recording money the
 * practice collected outside Engage.
 *
 * Until now nothing but a Stripe webhook could set paymentStatus, so a practice
 * collecting by bank transfer saw every accepted proposal as unpaid forever
 * (Fortis, 2026-08-12: collectPaymentAtSign on, no Connect account, 11 of 12
 * proposals at paymentStatus null).
 *
 * The load-bearing rule is that a manual record must never overwrite or erase
 * what Stripe knows. Provenance is stored as paymentProvider 'manual', and
 * unmarking is permitted only for records that carry it.
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

jest.mock('../../../config/database.js', () => ({
  prisma: {
    proposal: { findFirst: proposalFindFirst, update: proposalUpdate },
    activityLog: { create: activityLogCreate },
  },
}));

jest.mock('../../../services/proposalSharingService.js', () => ({
  revokeShareableLink: jest.fn(),
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

const acceptedUnpaid = {
  id: 'p1',
  tenantId: 't1',
  title: 'Fortis Renewal Proposal',
  status: 'ACCEPTED',
  paymentStatus: null,
  paymentProvider: null,
  stripeSubscriptionId: null,
  totalPence: 34560,
  client: { name: 'Swain Building & Maintenance Ltd' },
};

beforeEach(() => {
  proposalFindFirst.mockReset();
  proposalUpdate
    .mockReset()
    .mockImplementation(({ data }) => Promise.resolve({ ...acceptedUnpaid, ...data }));
  activityLogCreate.mockReset().mockResolvedValue({});
});

describe('POST /api/proposals/:id/mark-paid', () => {
  it('records a bank transfer: PAID, paidAt, method, manual provenance, audit row', async () => {
    proposalFindFirst.mockResolvedValue(acceptedUnpaid);

    const res = await request(app())
      .post('/api/proposals/p1/mark-paid')
      .send({ method: 'BANK_TRANSFER', reference: 'FT12345', paidAt: '2026-08-10T00:00:00.000Z' });

    expect(res.status).toBe(200);
    expect(proposalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({
          paymentStatus: 'PAID',
          paymentProvider: 'manual',
          paymentMethod: 'BANK_TRANSFER',
          paidAt: new Date('2026-08-10T00:00:00.000Z'),
        }),
      })
    );
    expect(activityLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'PROPOSAL_PAYMENT_RECORDED', entityId: 'p1' }),
      })
    );
  });

  it('defaults paidAt to now when not supplied', async () => {
    proposalFindFirst.mockResolvedValue(acceptedUnpaid);

    const res = await request(app()).post('/api/proposals/p1/mark-paid').send({ method: 'CASH' });

    expect(res.status).toBe(200);
    expect(proposalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paidAt: expect.any(Date) }) })
    );
  });

  it('refuses to overwrite a Stripe-managed proposal', async () => {
    proposalFindFirst.mockResolvedValue({ ...acceptedUnpaid, stripeSubscriptionId: 'sub_123' });

    const res = await request(app())
      .post('/api/proposals/p1/mark-paid')
      .send({ method: 'BANK_TRANSFER' });

    expect(res.status).toBe(400);
    expect(proposalUpdate).not.toHaveBeenCalled();
  });

  it('refuses when already paid', async () => {
    proposalFindFirst.mockResolvedValue({ ...acceptedUnpaid, paymentStatus: 'PAID' });

    const res = await request(app())
      .post('/api/proposals/p1/mark-paid')
      .send({ method: 'BANK_TRANSFER' });

    expect(res.status).toBe(400);
    expect(proposalUpdate).not.toHaveBeenCalled();
  });

  it('refuses a proposal that has not been accepted', async () => {
    proposalFindFirst.mockResolvedValue({ ...acceptedUnpaid, status: 'DRAFT' });

    const res = await request(app())
      .post('/api/proposals/p1/mark-paid')
      .send({ method: 'BANK_TRANSFER' });

    expect(res.status).toBe(400);
    expect(proposalUpdate).not.toHaveBeenCalled();
  });

  it('rejects an unknown payment method', async () => {
    proposalFindFirst.mockResolvedValue(acceptedUnpaid);

    const res = await request(app()).post('/api/proposals/p1/mark-paid').send({ method: 'CRYPTO' });

    expect(res.status).toBe(400);
    expect(proposalUpdate).not.toHaveBeenCalled();
  });

  it('404s outside the tenant', async () => {
    proposalFindFirst.mockResolvedValue(null);

    const res = await request(app())
      .post('/api/proposals/p1/mark-paid')
      .send({ method: 'BANK_TRANSFER' });

    expect(res.status).toBe(404);
    expect(proposalUpdate).not.toHaveBeenCalled();
  });
});

describe('POST /api/proposals/:id/mark-unpaid', () => {
  it('reverses a manual record and logs the correction', async () => {
    proposalFindFirst.mockResolvedValue({
      ...acceptedUnpaid,
      paymentStatus: 'PAID',
      paymentProvider: 'manual',
      paidAt: new Date('2026-08-10T00:00:00.000Z'),
    });

    const res = await request(app()).post('/api/proposals/p1/mark-unpaid').send({});

    expect(res.status).toBe(200);
    expect(proposalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({
          paymentStatus: null,
          paidAt: null,
          paymentProvider: null,
        }),
      })
    );
    expect(activityLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'PROPOSAL_PAYMENT_RECORD_REVERSED' }),
      })
    );
  });

  it('never reverses a Stripe payment', async () => {
    proposalFindFirst.mockResolvedValue({
      ...acceptedUnpaid,
      paymentStatus: 'PAID',
      paymentProvider: 'stripe',
    });

    const res = await request(app()).post('/api/proposals/p1/mark-unpaid').send({});

    expect(res.status).toBe(400);
    expect(proposalUpdate).not.toHaveBeenCalled();
  });
});
