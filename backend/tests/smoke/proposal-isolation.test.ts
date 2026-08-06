import request from 'supertest';
import app from '../../src/index.js';
import { prisma } from '../../src/config/database.js';
import { getAccessTokenFromLogin, getCookieValue, getCsrfFromLogin } from './helpers.js';

describe('Proposal isolation smoke', () => {
  const agent = request.agent(app);
  let accessToken: string;
  let csrfToken: string;
  let clientId: string;
  let serviceId: string;
  let skipReason: string | null = null;

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
    const service = await prisma.serviceTemplate.findFirst({
      where: { tenantId: tenant.id, isActive: true },
    });

    if (!client || !service) {
      skipReason = 'Requires at least one client and service template';
      return;
    }

    clientId = client.id;
    serviceId = service.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('updating one proposal does not alter another proposal line snapshots', async () => {
    if (skipReason) {
      console.warn(`[smoke] Skipped: ${skipReason}`);
      return;
    }

    const loginRes = await agent.post('/api/auth/login').send({
      email: 'admin@demo.practice',
      password: 'DemoPass123!',
    });
    accessToken = getAccessTokenFromLogin(loginRes);
    csrfToken = getCsrfFromLogin(loginRes);
    if (!csrfToken) {
      const statusRes = await agent.get('/api/status');
      csrfToken = getCookieValue(statusRes, 'csrfToken');
    }

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'X-CSRF-Token': csrfToken,
    };

    const proposalA = await agent
      .post('/api/proposals')
      .set(headers)
      .send({
        clientId,
        title: 'Isolation test A',
        services: [
          {
            serviceId,
            name: 'Snapshot A',
            displayPrice: 111,
            billingFrequency: 'MONTHLY',
            quantity: 1,
          },
        ],
      });

    const proposalB = await agent
      .post('/api/proposals')
      .set(headers)
      .send({
        clientId,
        title: 'Isolation test B',
        services: [
          {
            serviceId,
            name: 'Snapshot B',
            displayPrice: 222,
            billingFrequency: 'MONTHLY',
            quantity: 1,
          },
        ],
      });

    expect(proposalA.status).toBe(201);
    expect(proposalB.status).toBe(201);

    const idA = proposalA.body.data.id;
    const idB = proposalB.body.data.id;

    const updateRes = await agent
      .put(`/api/proposals/${idB}`)
      .set(headers)
      .send({
        services: [
          {
            serviceId,
            name: 'Snapshot B updated',
            displayPrice: 999,
            billingFrequency: 'MONTHLY',
            quantity: 1,
          },
        ],
      });

    expect(updateRes.status).toBe(200);

    const refreshedA = await prisma.proposal.findUnique({
      where: { id: idA },
      include: { services: true },
    });
    const refreshedB = await prisma.proposal.findUnique({
      where: { id: idB },
      include: { services: true },
    });

    expect(refreshedA?.services[0]?.name).toBe('Snapshot A');
    expect(refreshedA?.services[0]?.displayPricePence).toBe(11100);
    expect(refreshedB?.services[0]?.name).toBe('Snapshot B updated');
    expect(refreshedB?.services[0]?.displayPricePence).toBe(99900);

    await prisma.proposal.deleteMany({ where: { id: { in: [idA, idB] } } });
  });

  it('cannot read another tenant proposal by id', async () => {
    if (skipReason) {
      throw new Error(`[smoke] Prerequisites missing: ${skipReason}`);
    }

    const otherTenant = await prisma.tenant.create({
      data: {
        subdomain: `iso-${Date.now()}`,
        name: 'Isolation Other Practice',
      },
    });

    const otherUser = await prisma.user.create({
      data: {
        tenantId: otherTenant.id,
        email: `iso-${Date.now()}@other.practice`,
        passwordHash: 'not-used',
        firstName: 'Other',
        lastName: 'Tenant',
        role: 'ADMIN',
        isActive: true,
      },
    });

    const otherClient = await prisma.client.create({
      data: {
        tenantId: otherTenant.id,
        name: 'Other Client Ltd',
        contactEmail: 'client@other.test',
        isActive: true,
      },
    });

    const foreignProposal = await prisma.proposal.create({
      data: {
        reference: `ISO-FOREIGN-${Date.now()}`,
        title: 'Foreign tenant proposal',
        status: 'DRAFT',
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        tenantId: otherTenant.id,
        clientId: otherClient.id,
        createdById: otherUser.id,
      },
    });

    const loginRes = await agent.post('/api/auth/login').send({
      email: 'admin@demo.practice',
      password: 'DemoPass123!',
    });
    const token = getAccessTokenFromLogin(loginRes);
    const csrf = getCsrfFromLogin(loginRes);

    const peek = await agent
      .get(`/api/proposals/${foreignProposal.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-CSRF-Token', csrf);

    expect([403, 404]).toContain(peek.status);

    await prisma.proposal.delete({ where: { id: foreignProposal.id } });
    await prisma.client.delete({ where: { id: otherClient.id } });
    await prisma.user.delete({ where: { id: otherUser.id } });
    await prisma.tenant.delete({ where: { id: otherTenant.id } });
  });
});
