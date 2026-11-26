import express from 'express';
import request from 'supertest';

const ADMIN_KEY = 'test-admin-secret-key';
process.env.ADMIN_SECRET_KEY = ADMIN_KEY;

const mintGrokToken = jest.fn();
const revokeGrokTokens = jest.fn();
const listGrokTokens = jest.fn();

jest.mock('../../services/grok/grokKeys.js', () => ({
  mintGrokToken: (...args: unknown[]) => mintGrokToken(...args),
  revokeGrokTokens: (...args: unknown[]) => revokeGrokTokens(...args),
  listGrokTokens: (...args: unknown[]) => listGrokTokens(...args),
  publicGrokMcpPath: () => '/api/grok/mcp',
  GrokTokenError: class GrokTokenError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  },
}));

jest.mock('../../config/database.js', () => ({ prisma: {} }));

async function loadApp() {
  const { default: adminRoutes } = await import('../admin.js');
  const a = express();
  a.use(express.json());
  a.use('/api/admin', adminRoutes);
  return a;
}

describe('admin grok connector tokens', () => {
  beforeEach(() => {
    mintGrokToken.mockReset().mockResolvedValue({
      token: 'eng_grok_secret_once',
      prefix: 'eng_grok_secret1',
      userId: 'u1',
      tenantName: 'Marks and Co',
      previousRevoked: 1,
    });
    revokeGrokTokens.mockReset().mockResolvedValue(1);
    listGrokTokens.mockReset();
  });

  it('refuses mint without the admin key and does not mint', async () => {
    const app = await loadApp();
    const res = await request(app).post('/api/admin/grok-connector/mint').send({ email: 'a@b.c' });
    expect(res.status).toBe(403);
    expect(mintGrokToken).not.toHaveBeenCalled();
  });

  it('returns the token once for a valid admin key', async () => {
    const app = await loadApp();
    const res = await request(app)
      .post('/api/admin/grok-connector/mint')
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ email: 'caroline@example.test' });
    expect(res.status).toBe(201);
    expect(res.body.data.token).toBe('eng_grok_secret_once');
    expect(res.body.data.shown_once).toBe(true);
    expect(res.body.data.mcp_path).toBe('/api/grok/mcp');
    expect(mintGrokToken).toHaveBeenCalledWith({
      email: 'caroline@example.test',
      userId: undefined,
      name: undefined,
    });
  });

  it('revokes by prefix', async () => {
    const app = await loadApp();
    const res = await request(app)
      .post('/api/admin/grok-connector/revoke')
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ prefix: 'eng_grok_secret1' });
    expect(res.status).toBe(200);
    expect(res.body.data.revoked).toBe(1);
    expect(revokeGrokTokens).toHaveBeenCalledWith({
      email: undefined,
      userId: undefined,
      prefix: 'eng_grok_secret1',
    });
  });
});
