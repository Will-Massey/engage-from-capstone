import request from 'supertest';
import { randomUUID } from 'crypto';
import app from '../../src/index.js';
import { prisma } from '../../src/config/database.js';

describe('Public payment routes smoke', () => {
  let skipReason: string | null = null;
  let tenantId: string;
  let clientId: string;
  let createdById: string;
  let shareToken: string;
  let proposalId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      skipReason = 'DATABASE_URL not set';
      return;
    }

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      skipReason = 'Database not reachable';
      return;
    }

    const tenant = await prisma.tenant.findFirst({
      where: { subdomain: process.env.DEFAULT_TENANT_SUBDOMAIN || 'demo' },
    });
    if (!tenant) {
      skipReason = 'Seeded tenant "demo" not found';
      return;
    }

    const client = await prisma.client.findFirst({
      where: { tenantId: tenant.id, isActive: true },
    });
    const user = await prisma.user.findFirst({
      where: { tenantId: tenant.id, isActive: true },
    });

    if (!client || !user) {
      skipReason = 'Requires seeded client and user';
      return;
    }

    tenantId = tenant.id;
    clientId = client.id;
    createdById = user.id;
    shareToken = `pay-smoke-${randomUUID()}`;
    const reference = `PAY-SMOKE-${Date.now()}`;

    const proposal = await prisma.proposal.create({
      data: {
        reference,
        title: 'Payment smoke proposal',
        status: 'ACCEPTED',
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        total: 150,
        subtotal: 125,
        vatAmount: 25,
        shareToken,
        shareTokenExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        publicAccessEnabled: true,
        paymentStatus: 'NOT_STARTED',
        tenantId,
        clientId,
        createdById,
      },
    });
    proposalId = proposal.id;
  });

  afterAll(async () => {
    if (proposalId) {
      await prisma.proposal.deleteMany({ where: { id: proposalId } });
    }
    await prisma.$disconnect();
  });

  it('GET /view/:token/payment-status returns stored payment state', async () => {
    if (skipReason) {
      throw new Error(`[smoke] Prerequisites missing: ${skipReason}`);
    }

    const res = await request(app).get(`/api/proposals/view/${shareToken}/payment-status`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('NOT_STARTED');
    expect(res.body.data.paid).toBe(false);
    expect(res.body.data.amount).toBe(150);
  });

  it('POST /view/:token/payment/setup rejects missing client authorisation', async () => {
    if (skipReason) {
      throw new Error(`[smoke] Prerequisites missing: ${skipReason}`);
    }

    const res = await request(app)
      .post(`/api/proposals/view/${shareToken}/payment/setup`)
      .send({ paymentAuthAccepted: false });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('PAYMENT_AUTH_REQUIRED');
  });

  it('POST /view/:token/payment/skip rejects missing acknowledgement', async () => {
    if (skipReason) {
      throw new Error(`[smoke] Prerequisites missing: ${skipReason}`);
    }

    const res = await request(app).post(`/api/proposals/view/${shareToken}/payment/skip`).send({});

    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown share tokens', async () => {
    if (skipReason) {
      throw new Error(`[smoke] Prerequisites missing: ${skipReason}`);
    }

    const res = await request(app).get('/api/proposals/view/not-a-real-token/payment-status');
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('PROPOSAL_NOT_FOUND');
  });
});
