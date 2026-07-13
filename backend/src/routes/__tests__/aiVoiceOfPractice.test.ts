/**
 * Voice of Practice route wiring:
 *   GET  /api/ai/voice-of-practice  — null-safe read (no error when unset)
 *   POST /api/ai/voice-of-practice  — accepts { sampleText }, persists via service
 * The heuristic/AI extraction lives in the service (mocked here).
 */
import express from 'express';
import request from 'supertest';

jest.mock('../../middleware/auth.js', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const r = req as express.Request & { tenantId?: string; user?: unknown };
    r.tenantId = 't1';
    r.user = {
      id: 'u1',
      email: 'a@x.com',
      firstName: 'A',
      lastName: 'B',
      role: 'PARTNER',
      tenantId: 't1',
    };
    next();
  },
  authorize: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

const getVoiceOfPractice = jest.fn();
const saveVoiceOfPracticeSample = jest.fn();
jest.mock('../../services/voiceOfPracticeService.js', () => ({
  getVoiceOfPractice: (...a: unknown[]) => getVoiceOfPractice(...a),
  saveVoiceOfPracticeSample: (...a: unknown[]) => saveVoiceOfPracticeSample(...a),
}));

jest.mock('../../config/sentry.js', () => ({
  captureException: jest.fn(),
  initSentry: jest.fn(),
  Sentry: {},
}));

import aiRoutes from '../ai.js';
import { errorHandler } from '../../middleware/errorHandler.js';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/ai', aiRoutes);
  a.use(errorHandler);
  return a;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/ai/voice-of-practice', () => {
  it('returns stored style hints', async () => {
    getVoiceOfPractice.mockResolvedValue({
      styleHints: 'Short sentences.',
      updatedAt: '2026-01-01',
    });

    const res = await request(app()).get('/api/ai/voice-of-practice');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.styleHints).toBe('Short sentences.');
  });

  it('returns 200 with null data when nothing is saved (no error toast)', async () => {
    getVoiceOfPractice.mockResolvedValue(null);

    const res = await request(app()).get('/api/ai/voice-of-practice');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeNull();
  });
});

describe('POST /api/ai/voice-of-practice', () => {
  it('persists a sample and returns the extracted hints', async () => {
    const sampleText = 'A'.repeat(120);
    saveVoiceOfPracticeSample.mockResolvedValue({
      sampleText,
      styleHints: 'Warm, welcoming opener.',
      updatedAt: '2026-01-02',
    });

    const res = await request(app()).post('/api/ai/voice-of-practice').send({ sampleText });

    expect(res.status).toBe(200);
    expect(res.body.data.styleHints).toBe('Warm, welcoming opener.');
    expect(saveVoiceOfPracticeSample).toHaveBeenCalledWith('t1', 'u1', sampleText);
  });

  it('rejects a sample shorter than 80 characters with 400', async () => {
    const res = await request(app())
      .post('/api/ai/voice-of-practice')
      .send({ sampleText: 'too short' });

    expect(res.status).toBe(400);
    expect(saveVoiceOfPracticeSample).not.toHaveBeenCalled();
  });
});
