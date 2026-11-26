import express from 'express';
import request from 'supertest';

const lookupActiveGrokToken = jest.fn();
const touchGrokToken = jest.fn();

jest.mock('../../services/grok/grokKeys.js', () => ({
  lookupActiveGrokToken: (...args: unknown[]) => lookupActiveGrokToken(...args),
  touchGrokToken: (...args: unknown[]) => touchGrokToken(...args),
  parseScopes: (scopes: string) =>
    new Set(
      scopes
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    ),
}));

jest.mock('../../config/database.js', () => ({ prisma: {} }));

import grokMcpRoutes from '../grokMcp';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/grok/mcp', grokMcpRoutes);
  return a;
}

describe('POST /api/grok/mcp', () => {
  beforeEach(() => {
    lookupActiveGrokToken.mockReset();
    touchGrokToken.mockReset().mockResolvedValue(undefined);
  });

  it('rejects a missing token', async () => {
    const res = await request(app())
      .post('/api/grok/mcp')
      .send({ jsonrpc: '2.0', id: 1, method: 'ping' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/Invalid or revoked/);
    expect(lookupActiveGrokToken).not.toHaveBeenCalled();
  });

  it('rejects a revoked token', async () => {
    lookupActiveGrokToken.mockResolvedValue(null);
    const res = await request(app())
      .post('/api/grok/mcp')
      .set('Authorization', 'Bearer eng_grok_revoked')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid or revoked Engage connector token');
  });

  it('answers initialize for an active user token', async () => {
    lookupActiveGrokToken.mockResolvedValue({
      id: 'tok1',
      tenantId: 't1',
      scopes: 'read,draft_proposals',
      tenant: { id: 't1', name: 'Marks and Co', isActive: true },
      user: {
        id: 'u1',
        tenantId: 't1',
        firstName: 'Caroline',
        lastName: 'Marks',
        isActive: true,
        deletedAt: null,
      },
    });
    const res = await request(app())
      .post('/api/grok/mcp')
      .set('Authorization', 'Bearer eng_grok_live')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26' },
      });
    expect(res.status).toBe(200);
    expect(res.body.result.serverInfo.name).toBe('engage-grok-connector');
    expect(touchGrokToken).toHaveBeenCalledWith('tok1');
  });
});
