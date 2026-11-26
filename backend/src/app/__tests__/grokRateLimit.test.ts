import express from 'express';
import request from 'supertest';

jest.mock('../../config/database.js', () => ({ prisma: {} }));

import { grokMcpLimiter } from '../rateLimiters';

describe('grok connector rate limit', () => {
  it('stops the endpoint after 60 calls in the window', async () => {
    const app = express();
    app.use('/api/grok/mcp', grokMcpLimiter);
    app.post('/api/grok/mcp', (_req, res) => {
      res.json({ ok: true });
    });

    for (let i = 0; i < 60; i += 1) {
      const res = await request(app).post('/api/grok/mcp').send({});
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).post('/api/grok/mcp').send({});
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.message).toMatch(/Too many connector requests/);
  }, 30000);
});
