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

describe('GET /api/admin/first-wins', () => {
  beforeEach(() => {
    buildFirstWinDailyReport.mockReset().mockResolvedValue({
      date: '2026-09-28',
      timezone: 'UTC',
      signups: [],
      firstWinsRecordedOnDate: [],
      summary: {
        signups: 0,
        signupsWithFirstWin: 0,
        signupsStillOnboarding: 0,
        firstWinsRecordedOnDate: 0,
      },
    });
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
    expect(buildFirstWinDailyReport).not.toHaveBeenCalled();
  });

  it('returns the daily report for a valid key', async () => {
    const app = await loadApp();
    const res = await request(app)
      .get('/api/admin/first-wins?date=2026-09-28')
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.date).toBe('2026-09-28');
    expect(buildFirstWinDailyReport).toHaveBeenCalledWith('2026-09-28');
  });
});
