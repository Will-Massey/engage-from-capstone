/**
 * POST /api/proposals/:id/share — copying the client link marks a DRAFT
 * proposal as SENT (and makes it accessible), subject to the same guards as
 * the email-send path: approval, AML, subscription/trial. Non-DRAFT proposals
 * just get the link back with no status change.
 */
import express from 'express';
import request from 'supertest';

let mockRole: any = 'PARTNER';
jest.mock('../../../middleware/auth.js', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const r = req as express.Request & { tenantId?: string; user?: unknown; tenant?: unknown };
    r.tenantId = 't1';
    r.user = {
      id: 'u1',
      email: 'a@x.com',
      firstName: 'A',
      lastName: 'B',
      role: mockRole,
      tenantId: 't1',
    };
    r.tenant = { subdomain: 'demo' };
    next();
  },
}));

const proposalFindFirst = jest.fn();
const proposalUpdate = jest.fn();
const activityLogCreate = jest.fn();
const createShareableLink = jest.fn();
const assertTenantCanSendProposals = jest.fn();

jest.mock('../../../config/database.js', () => ({
  prisma: {
    proposal: { findFirst: proposalFindFirst, update: proposalUpdate },
    activityLog: { create: activityLogCreate },
  },
}));

jest.mock('../../../services/proposalSharingService.js', () => ({
  createShareableLink: (...a: unknown[]) => createShareableLink(...a),
  revokeShareableLink: jest.fn(),
  getProposalViewStats: jest.fn(),
  getProposalSignatures: jest.fn(),
  getSignatureAuditRecord: jest.fn(),
  generateComplianceAuditTrail: jest.fn(),
  generateProposalPdfUrl: jest.fn(() => 'https://x/pdf'),
}));

jest.mock('../../../services/subscriptionService.js', () => ({
  assertTenantCanSendProposals: (...a: unknown[]) => assertTenantCanSendProposals(...a),
}));

jest.mock('../../../services/tenantMailer.js', () => ({ tenantMailer: { send: jest.fn() } }));
jest.mock('../../../services/pdfGenerator.js', () => ({ __esModule: true, default: {} }));
jest.mock('../../../config/sentry.js', () => ({
  captureException: jest.fn(),
  initSentry: jest.fn(),
  Sentry: {},
}));

import shareRoutes from '../manage.js';
import { errorHandler, ApiError } from '../../../middleware/errorHandler.js';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/proposals', shareRoutes);
  a.use(errorHandler);
  return a;
}

const draft = {
  id: 'p1',
  tenantId: 't1',
  reference: 'PROP-1',
  status: 'DRAFT',
  approvalStatus: 'NONE',
  client: { name: 'Acme Ltd', amlStatus: 'CLEAR' },
  tenant: { settings: '{}' },
};

beforeEach(() => {
  mockRole = 'PARTNER';
  proposalFindFirst.mockReset();
  proposalUpdate.mockReset().mockResolvedValue({});
  activityLogCreate.mockReset().mockResolvedValue({});
  createShareableLink.mockReset().mockResolvedValue({
    token: 'tok',
    shareUrl: 'https://x/proposals/view/tok',
    expiresAt: new Date('2026-12-01'),
  });
  assertTenantCanSendProposals.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/proposals/:id/share marks DRAFT as sent', () => {
  it('marks a sendable DRAFT as SENT, sets sentAt, logs PROPOSAL_SENT, returns link', async () => {
    proposalFindFirst.mockResolvedValue(draft);

    const res = await request(app()).post('/api/proposals/p1/share').send({});

    expect(res.status).toBe(200);
    expect(res.body.data.shareUrl).toContain('/proposals/view/');
    expect(assertTenantCanSendProposals).toHaveBeenCalledWith('t1');
    expect(proposalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({ status: 'SENT', sentAt: expect.any(Date) }),
      })
    );
    expect(activityLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'PROPOSAL_SENT', entityId: 'p1' }),
      })
    );
  });

  it('blocks when awaiting approval (non-override role) and leaves it DRAFT', async () => {
    mockRole = 'SENIOR'; // not an approval-override role
    proposalFindFirst.mockResolvedValue({ ...draft, approvalStatus: 'PENDING' });

    const res = await request(app()).post('/api/proposals/p1/share').send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('APPROVAL_PENDING');
    expect(proposalUpdate).not.toHaveBeenCalled();
  });

  it('blocks with 402 when the tenant cannot send (trial expired) and leaves it DRAFT', async () => {
    proposalFindFirst.mockResolvedValue(draft);
    assertTenantCanSendProposals.mockRejectedValue(
      new ApiError('TRIAL_EXPIRED', 'Your trial has ended', 402)
    );

    const res = await request(app()).post('/api/proposals/p1/share').send({});

    expect(res.status).toBe(402);
    expect(proposalUpdate).not.toHaveBeenCalled();
  });

  it('does NOT change status for an already-SENT proposal, just returns the link', async () => {
    proposalFindFirst.mockResolvedValue({ ...draft, status: 'SENT' });

    const res = await request(app()).post('/api/proposals/p1/share').send({});

    expect(res.status).toBe(200);
    expect(proposalUpdate).not.toHaveBeenCalled();
    expect(assertTenantCanSendProposals).not.toHaveBeenCalled();
  });
});
