/**
 * R2.3 — configurable AML send gate. With blockSendUntilAmlCleared on, a
 * proposal cannot be sent while the client is not CLEAR (409 AML_NOT_CLEARED);
 * partner-level roles may pass overrideAml:true, which is audit-logged.
 */
import express from 'express';
import request from 'supertest';

let mockRole = 'PARTNER';

jest.mock('../src/middleware/auth.js', () => {
  const actual = jest.requireActual('../src/middleware/auth.js');
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => {
      req.user = {
        id: 'user-1',
        email: 'partner@test.dev',
        firstName: 'Pat',
        lastName: 'Partner',
        role: mockRole,
      };
      req.tenantId = 'tenant-1';
      next();
    },
  };
});

jest.mock('../src/middleware/subscription.js', () => ({
  requireActiveSubscription: (_req: any, _res: any, next: any) => next(),
}));

const proposalFindFirst = jest.fn();
const proposalUpdate = jest.fn(async () => ({ id: 'prop-1', status: 'SENT' }));
const activityCreate = jest.fn(async () => ({}));
const userFindUnique = jest.fn(async () => ({ jobTitle: 'Partner', role: 'PARTNER' }));

jest.mock('../src/config/database.js', () => ({
  prisma: {
    proposal: { findFirst: proposalFindFirst, update: proposalUpdate },
    activityLog: { create: activityCreate },
    user: { findUnique: userFindUnique },
  },
}));

const sendProposalEmail = jest.fn(async () => ({ success: true }));
jest.mock('../src/services/tenantMailer.js', () => ({
  tenantMailer: { sendProposalEmail },
}));

jest.mock('../src/services/pdfGenerator.js', () => ({
  PDFGenerator: { generateProposal: jest.fn(async () => Buffer.from('%PDF-1.4 test')) },
}));

jest.mock('../src/services/proposalSharingService.js', () => ({
  createShareableLink: jest.fn(async () => ({ token: 'tok_new' })),
  revokeShareableLink: jest.fn(async () => undefined),
}));

jest.mock('../src/services/integrationEvents.js', () => ({
  emitIntegrationEvent: jest.fn(async () => undefined),
}));

jest.mock('../src/config/logger.js', () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import lifecycleRouter from '../src/routes/proposals/lifecycle.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

const app = express();
app.use(express.json());
app.use('/', lifecycleRouter);
app.use(errorHandler);

function makeProposal(overrides: {
  amlStatus?: string;
  blockSendUntilAmlCleared?: boolean;
}): Record<string, unknown> {
  const { amlStatus = 'PENDING', blockSendUntilAmlCleared = true } = overrides;
  return {
    id: 'prop-1',
    tenantId: 'tenant-1',
    clientId: 'client-1',
    title: 'Annual accounts',
    reference: 'PROP-TEST-1',
    status: 'DRAFT',
    approvalStatus: 'APPROVED',
    total: 1200,
    validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    shareToken: 'tok_existing',
    shareTokenExpiry: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    publicAccessEnabled: true,
    client: {
      id: 'client-1',
      name: 'Acme Ltd',
      contactEmail: 'client@acme.test',
      amlStatus,
    },
    services: [],
    tenant: {
      subdomain: 'demo',
      name: 'Demo Practice',
      settings: JSON.stringify({ proposals: { blockSendUntilAmlCleared } }),
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'PARTNER';
});

describe('POST /:id/send AML gate', () => {
  it('sends regardless of AML status when the setting is off', async () => {
    proposalFindFirst.mockResolvedValue(
      makeProposal({ amlStatus: 'NOT_STARTED', blockSendUntilAmlCleared: false })
    );

    const res = await request(app).post('/prop-1/send').send({});

    expect(res.status).toBe(200);
    expect(sendProposalEmail).toHaveBeenCalled();
  });

  it('blocks with 409 AML_NOT_CLEARED when the setting is on and the client is not CLEAR', async () => {
    proposalFindFirst.mockResolvedValue(makeProposal({ amlStatus: 'PENDING' }));

    const res = await request(app).post('/prop-1/send').send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('AML_NOT_CLEARED');
    expect(res.body.error.message).toContain('PENDING');
    expect(sendProposalEmail).not.toHaveBeenCalled();
    expect(proposalUpdate).not.toHaveBeenCalled();
  });

  it('sends when the setting is on and the client is CLEAR', async () => {
    proposalFindFirst.mockResolvedValue(makeProposal({ amlStatus: 'CLEAR' }));

    const res = await request(app).post('/prop-1/send').send({});

    expect(res.status).toBe(200);
    expect(sendProposalEmail).toHaveBeenCalled();
  });

  it('allows a partner-level role to override with overrideAml and audit-logs it', async () => {
    proposalFindFirst.mockResolvedValue(makeProposal({ amlStatus: 'REFER' }));

    const res = await request(app).post('/prop-1/send').send({ overrideAml: true });

    expect(res.status).toBe(200);
    expect(sendProposalEmail).toHaveBeenCalled();
    expect(activityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PROPOSAL_AML_OVERRIDE',
          userId: 'user-1',
          description: expect.stringContaining('REFER'),
        }),
      })
    );
  });

  it('does not honour overrideAml from a non-override role (SENIOR)', async () => {
    mockRole = 'SENIOR';
    proposalFindFirst.mockResolvedValue(makeProposal({ amlStatus: 'PENDING' }));

    const res = await request(app).post('/prop-1/send').send({ overrideAml: true });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('AML_NOT_CLEARED');
    expect(sendProposalEmail).not.toHaveBeenCalled();
  });

  it('still rejects JUNIOR at the role gate before AML is considered', async () => {
    mockRole = 'JUNIOR';
    proposalFindFirst.mockResolvedValue(makeProposal({ amlStatus: 'PENDING' }));

    const res = await request(app).post('/prop-1/send').send({ overrideAml: true });

    expect(res.status).toBe(403);
    expect(sendProposalEmail).not.toHaveBeenCalled();
  });
});
