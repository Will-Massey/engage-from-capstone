import request, { type Response } from 'supertest';
import app from '../../src/index.js';
import { prisma } from '../../src/config/database.js';

function getCookieValue(res: Response, name: string): string {
  const raw = res.headers['set-cookie'];
  if (!raw) return '';
  const lines = Array.isArray(raw) ? raw : [String(raw)];
  for (const line of lines) {
    const match = line.match(new RegExp(`${name}=([^;]+)`));
    if (match) return match[1];
  }
  return '';
}

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
    accessToken = loginRes.body.data.tokens.accessToken;
    csrfToken = getCookieValue(loginRes, 'csrfToken');
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
    expect(refreshedA?.services[0]?.displayPrice).toBe(111);
    expect(refreshedB?.services[0]?.name).toBe('Snapshot B updated');
    expect(refreshedB?.services[0]?.displayPrice).toBe(999);

    await prisma.proposal.deleteMany({ where: { id: { in: [idA, idB] } } });
  });
});