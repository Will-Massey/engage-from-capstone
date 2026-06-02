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

/**
 * Integration smoke tests — require a reachable DATABASE_URL and seeded demo data.
 * Run: npm run test:integration
 */
describe('API smoke — auth & proposals', () => {
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
      skipReason = 'Seeded tenant "demo" not found — run npm run db:seed';
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        tenantId: tenant.id,
        email: 'admin@demo.practice',
        isActive: true,
      },
    });
    if (!user) {
      skipReason = 'Demo user admin@demo.practice not found';
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

  it('POST /api/auth/login returns access token for demo user', async () => {
    if (skipReason) {
      console.warn(`[smoke] Skipped: ${skipReason}`);
      return;
    }

    const res = await agent.post('/api/auth/login').send({
      email: 'admin@demo.practice',
      password: 'DemoPass123!',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.tokens?.accessToken).toBeDefined();
    accessToken = res.body.data.tokens.accessToken;
  });

  it('POST /api/proposals creates a draft proposal', async () => {
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
    expect(csrfToken.length).toBeGreaterThan(0);

    const res = await agent
      .post('/api/proposals')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-CSRF-Token', csrfToken)
      .send({
        clientId,
        title: 'Smoke test proposal',
        services: [{ serviceId, quantity: 1 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.id).toBeDefined();
    expect(res.body.data?.status).toBe('DRAFT');
  });
});
