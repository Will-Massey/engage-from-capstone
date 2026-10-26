/**
 * GET /api/admin/first-wins — admin key only, no session.
 * The admin router reads ADMIN_SECRET_KEY when the module loads, so the env
 * value is set before that import.
 */

import express from 'express';
import request from 'supertest';

const ADMIN_KEY = 'test-admin-secret-key';
process.env.ADMIN_SECRET_KEY = ADMIN_KEY;

const buildFirstWinDailyReport = jest.fn();

jest.mock('../../services/firstWin.js', () => ({
  buildFirstWinDailyReport: (...args: unknown[]) => buildFirstWinDailyReport(...args),
  utcDayBounds: (date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const start = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== date) return null;
    return { start, end: new Date(start.getTime() + 86_400_000) };
  },
}));

jest.mock('../../config/database.js', () => ({
  prisma: {},
}));

async function loadApp() {
  const { default: adminRoutes } = await import('../admin.js');
  const a = express();
  a.use(express.json());
  a.use('/api/admin', adminRoutes);
  return a;
}

function reportFor(date: string) {
  return {
    date,
    timezone: 'UTC',
    signups: [],
    firstWinsRecordedOnDate: [],
    summary: {
      signups: 0,
      signupsWithFirstWin: 0,
      signupsStillOnboarding: 0,
      firstWinsRecordedOnDate: 0,
    },
  };
}

describe('GET /api/admin/first-wins', () => {
  beforeEach(() => {
    buildFirstWinDailyReport
      .mockReset()
      .mockImplementation(async (date: string) => reportFor(date));
  });

  it('rejects a missing or wrong admin key', async () => {
    const app = await loadApp();
    const missing = await request(app).get('/api/admin/first-wins?date=2026-09-28');
    expect(missing.status).toBe(403);

    const wrong = await request(app)
      .get('/api/admin/first-wins?date=2026-09-28')
      .set('X-Admin-Key', 'nope');
    expect(wrong.status).toBe(403);
    expect(buildFirstWinDailyReport).not.toHaveBeenCalled();
  });

  it('rejects a query-string key', async () => {
    const app = await loadApp();
    const res = await request(app)
      .get(`/api/admin/first-wins?date=2026-09-28&key=${ADMIN_KEY}`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(400);
  });

  it('rejects a bad date', async () => {
    const app = await loadApp();
    const res = await request(app)
      .get('/api/admin/first-wins?date=not-a-day')
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: 'date must be a valid YYYY-MM-DD date (UTC)',
    });
    expect(buildFirstWinDailyReport).not.toHaveBeenCalled();
  });

  it('rejects an empty, repeated, or impossible date', async () => {
    const app = await loadApp();
    const queries = [
      'date=',
      'date=2026-02-31',
      'date=2026-09-28&date=2026-09-29',
      'date=2026-9-28',
    ];
    for (const query of queries) {
      const res = await request(app)
        .get(`/api/admin/first-wins?${query}`)
        .set('X-Admin-Key', ADMIN_KEY);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('date must be a valid YYYY-MM-DD date (UTC)');
    }
    expect(buildFirstWinDailyReport).not.toHaveBeenCalled();
  });

  it('rejects a misspelt date parameter instead of reporting today', async () => {
    const app = await loadApp();
    const res = await request(app)
      .get('/api/admin/first-wins?day=2026-09-28')
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('"day"');
    expect(res.body.error).toContain('date=YYYY-MM-DD');
    expect(res.body.date).toBeUndefined();
    expect(buildFirstWinDailyReport).not.toHaveBeenCalled();
  });

  it('rejects an unknown query parameter even when date is valid', async () => {
    const app = await loadApp();
    const res = await request(app)
      .get('/api/admin/first-wins?date=2026-09-28&day=')
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('"day"');
    expect(buildFirstWinDailyReport).not.toHaveBeenCalled();
  });

  it('does not echo unknown query values', async () => {
    const app = await loadApp();
    const leaked = 'query-value-must-not-appear';
    const res = await request(app)
      .get(`/api/admin/first-wins?day=${leaked}`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain(leaked);
    expect(buildFirstWinDailyReport).not.toHaveBeenCalled();
  });

  it('uses the current UTC day when date is omitted and echoes that date', async () => {
    const app = await loadApp();
    const before = new Date().toISOString().slice(0, 10);
    const res = await request(app).get('/api/admin/first-wins').set('X-Admin-Key', ADMIN_KEY);
    const after = new Date().toISOString().slice(0, 10);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect([before, after]).toContain(res.body.date);
    expect(res.body.data.date).toBe(res.body.date);
    expect(buildFirstWinDailyReport).toHaveBeenCalledWith(res.body.date);
  });

  it('returns the daily report for a valid key', async () => {
    const app = await loadApp();
    const res = await request(app)
      .get('/api/admin/first-wins?date=2026-09-28')
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.date).toBe('2026-09-28');
    expect(res.body.data.date).toBe('2026-09-28');
    expect(buildFirstWinDailyReport).toHaveBeenCalledWith('2026-09-28');
  });
});
