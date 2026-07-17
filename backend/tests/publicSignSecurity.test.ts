/**
 * Public share-token routes — 2026-07-07 audit M2/L3:
 * - practice notification emails must HTML-escape share-token-holder input
 * - payment-setup failures must not forward internal error messages
 */
import express from 'express';
import request from 'supertest';

jest.mock('../src/services/proposalSharingService.js', () => ({
  getProposalByShareToken: jest.fn(),
  recordElectronicSignature: jest.fn(),
}));

jest.mock('../src/services/tenantMailer.js', () => ({
  tenantMailer: { send: jest.fn().mockResolvedValue({ success: true }) },
}));

jest.mock('../src/services/ai/winLossAiService.js', () => ({
  classifyDeclineReasonText: jest.fn().mockResolvedValue(null),
}));

jest.mock('../src/services/ai/publicProposalAiService.js', () => ({
  logPublicAiUsage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/paymentCollection.js', () => ({
  createPostSignMandate: jest.fn(),
  skipPaymentSetup: jest.fn().mockResolvedValue(undefined),
  getPublicPaymentConfig: jest.fn(),
  shouldCollectPaymentAtSign: jest.fn().mockResolvedValue(false),
}));

jest.mock('../src/config/database.js', () => ({
  prisma: {
    proposal: {
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
    },
    activityLog: { create: jest.fn().mockResolvedValue({}) },
    proposalSignature: { count: jest.fn().mockResolvedValue(0) },
  },
}));

import publicSignRouter from '../src/routes/proposalsShare/publicSign.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { getProposalByShareToken } from '../src/services/proposalSharingService.js';
import { tenantMailer } from '../src/services/tenantMailer.js';
import {
  createPostSignMandate,
  getPublicPaymentConfig,
} from '../src/services/paymentCollection.js';
import { prisma } from '../src/config/database.js';

const app = express();
app.use(express.json());
app.use('/', publicSignRouter);
app.use(errorHandler);

const shareProposal = (over: Record<string, unknown> = {}) => ({
  id: 'prop-1',
  tenantId: 'tenant-1',
  clientId: 'client-1',
  status: 'SENT',
  validUntil: null,
  totalPence: 10000,
  ...over,
});

const fullProposal = {
  id: 'prop-1',
  clientId: 'client-1',
  reference: 'PROP-0001',
  title: 'Annual Accounts',
  client: { name: 'Acme Ltd' },
  tenant: { name: 'Demo Practice' },
  createdBy: { email: 'staff@practice.dev', firstName: 'Pat', lastName: 'Partner' },
};

beforeEach(() => {
  jest.clearAllMocks();
  (tenantMailer.send as jest.Mock).mockResolvedValue({ success: true });
});

describe('decline notification email escaping (M2)', () => {
  it('escapes <script> in the decline reason before building HTML', async () => {
    (getProposalByShareToken as jest.Mock).mockResolvedValue(shareProposal());
    (prisma.proposal.findUnique as jest.Mock).mockResolvedValue(fullProposal);

    const res = await request(app).post('/view/token-decline-1/decline').send({
      reason: 'Too costly <script>alert("xss")</script>',
      declinedBy: 'Eve <img src=x onerror=alert(1)>',
    });

    expect(res.status).toBe(200);
    expect(tenantMailer.send).toHaveBeenCalledTimes(1);
    const { html, text } = (tenantMailer.send as jest.Mock).mock.calls[0][0].message;
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    // plain-text part stays readable/unescaped
    expect(text).toContain('<script>');
  });
});

describe('payment-skip notification email escaping (M2)', () => {
  it('escapes user-supplied skip reason before building HTML', async () => {
    (getProposalByShareToken as jest.Mock).mockResolvedValue(
      shareProposal({ status: 'ACCEPTED', paymentStatus: 'PENDING' })
    );
    (getPublicPaymentConfig as jest.Mock).mockResolvedValue({ paymentRequired: true });
    (prisma.proposal.findUnique as jest.Mock).mockResolvedValue(fullProposal);

    const res = await request(app)
      .post('/view/token-skip-1/payment/skip')
      .send({ acknowledged: true, reason: 'Later <script>steal()</script>' });

    expect(res.status).toBe(200);
    expect(tenantMailer.send).toHaveBeenCalledTimes(1);
    const { html } = (tenantMailer.send as jest.Mock).mock.calls[0][0].message;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('payment setup error responses (L3)', () => {
  it('returns a generic message instead of the internal error', async () => {
    (getProposalByShareToken as jest.Mock).mockResolvedValue(shareProposal({ status: 'ACCEPTED' }));
    (createPostSignMandate as jest.Mock).mockRejectedValue(
      new Error('Stripe key sk_live_secret123 rejected by provider')
    );

    const res = await request(app)
      .post('/view/token-pay-1/payment/setup')
      .send({ paymentAuthAccepted: true });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PAYMENT_SETUP_FAILED');
    expect(res.body.error.message).toBe('Failed to set up payment');
    expect(JSON.stringify(res.body)).not.toContain('sk_live_secret123');
  });
});
