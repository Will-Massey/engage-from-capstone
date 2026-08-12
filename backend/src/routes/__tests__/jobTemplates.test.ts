/**
 * GET/POST/PUT/DELETE /api/job-templates/... — job template CRUD routes.
 * Role gates (mutating endpoints exclude JUNIOR), zod validation, and
 * service-error -> HTTP-status mapping (404 not-found, 409 duplicate/in-use).
 */
import express from 'express';
import request from 'supertest';

let currentRole = 'PARTNER';

jest.mock('../../middleware/auth.js', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const r = req as express.Request & { tenantId?: string; user?: unknown };
    r.tenantId = 't1';
    r.user = {
      id: 'u1',
      email: 'a@x.com',
      firstName: 'A',
      lastName: 'B',
      role: currentRole as any,
      tenantId: 't1',
    };
    next();
  },
  authorize:
    (...roles: string[]) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const role = (req as express.Request & { user?: { role?: string } }).user?.role;
      if (role === 'ADMIN' || role === 'MD' || (role && roles.includes(role))) return next();
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } });
    },
}));

const listJobTemplates = jest.fn();
const getJobTemplate = jest.fn();
const createJobTemplate = jest.fn();
const updateJobTemplate = jest.fn();
const deleteJobTemplate = jest.fn();
const cloneJobTemplate = jest.fn();
const seedDefaultTemplates = jest.fn();

jest.mock('../../services/jobTemplateService.js', () => ({
  listJobTemplates: (...a: unknown[]) => listJobTemplates(...a),
  getJobTemplate: (...a: unknown[]) => getJobTemplate(...a),
  createJobTemplate: (...a: unknown[]) => createJobTemplate(...a),
  updateJobTemplate: (...a: unknown[]) => updateJobTemplate(...a),
  deleteJobTemplate: (...a: unknown[]) => deleteJobTemplate(...a),
  cloneJobTemplate: (...a: unknown[]) => cloneJobTemplate(...a),
  seedDefaultTemplates: (...a: unknown[]) => seedDefaultTemplates(...a),
}));

jest.mock('../../config/sentry.js', () => ({
  captureException: jest.fn(),
  initSentry: jest.fn(),
  Sentry: {},
}));

import jobTemplatesRoutes from '../jobTemplates.js';
import { errorHandler } from '../../middleware/errorHandler.js';
import { ApiError } from '../../middleware/errorHandler.js';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/job-templates', jobTemplatesRoutes);
  a.use(errorHandler);
  return a;
}

function templateDto(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tpl1',
    name: 'Year End Accounts',
    description: null,
    serviceCategory: 'COMPLIANCE',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    phases: [
      {
        id: 'ph1',
        name: 'Request records',
        sortOrder: 0,
        items: [{ id: 'it1', label: 'Send checklist', sortOrder: 0 }],
      },
    ],
    ...overrides,
  };
}

const validBody = {
  name: 'Year End Accounts',
  description: 'Standard job',
  serviceCategory: 'COMPLIANCE',
  isActive: true,
  phases: [
    {
      name: 'Request records',
      sortOrder: 0,
      items: [{ label: 'Send checklist', sortOrder: 0 }],
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  currentRole = 'PARTNER';
});

describe('role gates', () => {
  const MUTATING_ROUTES: [string, string, object][] = [
    ['post', '/', validBody],
    ['put', '/tpl1', validBody],
    ['delete', '/tpl1', {}],
    ['post', '/tpl1/clone', { name: 'Copy' }],
    ['post', '/seed-defaults', {}],
  ];

  it.each(MUTATING_ROUTES)('excludes JUNIOR from %s %s', async (method, path, body) => {
    currentRole = 'JUNIOR';
    const agent = request(app()) as any;
    const res = await agent[method](`/api/job-templates${path}`).send(body);
    expect(res.status).toBe(403);
  });

  it('allows JUNIOR on GET /', async () => {
    currentRole = 'JUNIOR';
    listJobTemplates.mockResolvedValue([]);
    const res = await request(app()).get('/api/job-templates');
    expect(res.status).toBe(200);
  });

  it('allows JUNIOR on GET /:id', async () => {
    currentRole = 'JUNIOR';
    getJobTemplate.mockResolvedValue(templateDto());
    const res = await request(app()).get('/api/job-templates/tpl1');
    expect(res.status).toBe(200);
  });

  it('allows SENIOR on mutating routes', async () => {
    currentRole = 'SENIOR';
    createJobTemplate.mockResolvedValue(templateDto());
    const res = await request(app()).post('/api/job-templates').send(validBody);
    expect(res.status).toBe(201);
  });
});

describe('GET /', () => {
  it('lists templates for the tenant', async () => {
    listJobTemplates.mockResolvedValue([templateDto()]);
    const res = await request(app()).get('/api/job-templates');
    expect(res.status).toBe(200);
    expect(res.body.data.templates).toHaveLength(1);
    expect(listJobTemplates).toHaveBeenCalledWith('t1');
  });
});

describe('GET /:id', () => {
  it('returns the template', async () => {
    getJobTemplate.mockResolvedValue(templateDto());
    const res = await request(app()).get('/api/job-templates/tpl1');
    expect(res.status).toBe(200);
    expect(res.body.data.template.id).toBe('tpl1');
    expect(getJobTemplate).toHaveBeenCalledWith('t1', 'tpl1');
  });

  it('404s when the service returns null (not found / cross-tenant)', async () => {
    getJobTemplate.mockResolvedValue(null);
    const res = await request(app()).get('/api/job-templates/missing');
    expect(res.status).toBe(404);
  });
});

describe('POST /', () => {
  it('creates a template', async () => {
    createJobTemplate.mockResolvedValue(templateDto());
    const res = await request(app()).post('/api/job-templates').send(validBody);
    expect(res.status).toBe(201);
    expect(createJobTemplate).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ name: validBody.name })
    );
  });

  it('400s on invalid body (zod)', async () => {
    const res = await request(app()).post('/api/job-templates').send({ name: '', phases: [] });
    expect(res.status).toBe(400);
    expect(createJobTemplate).not.toHaveBeenCalled();
  });

  it('409s when the service throws DUPLICATE_NAME', async () => {
    createJobTemplate.mockRejectedValue(
      new ApiError('DUPLICATE_NAME', 'A template with this name already exists', 409)
    );
    const res = await request(app()).post('/api/job-templates').send(validBody);
    expect(res.status).toBe(409);
  });
});

describe('PUT /:id', () => {
  it('updates a template', async () => {
    updateJobTemplate.mockResolvedValue(templateDto({ name: 'Renamed' }));
    const res = await request(app()).put('/api/job-templates/tpl1').send(validBody);
    expect(res.status).toBe(200);
    expect(updateJobTemplate).toHaveBeenCalledWith(
      't1',
      'tpl1',
      expect.objectContaining({ name: validBody.name })
    );
  });

  it('404s on cross-tenant / missing template', async () => {
    updateJobTemplate.mockRejectedValue(new ApiError('NOT_FOUND', 'Template not found', 404));
    const res = await request(app()).put('/api/job-templates/tpl-other').send(validBody);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /:id', () => {
  it('deletes a template', async () => {
    deleteJobTemplate.mockResolvedValue(undefined);
    const res = await request(app()).delete('/api/job-templates/tpl1');
    expect(res.status).toBe(200);
    expect(deleteJobTemplate).toHaveBeenCalledWith('t1', 'tpl1');
  });

  it('409s when the service refuses (IN_USE)', async () => {
    deleteJobTemplate.mockRejectedValue(
      new ApiError('IN_USE', 'This template has an active recurrence and cannot be deleted', 409)
    );
    const res = await request(app()).delete('/api/job-templates/tpl1');
    expect(res.status).toBe(409);
  });

  it('404s on cross-tenant delete', async () => {
    deleteJobTemplate.mockRejectedValue(new ApiError('NOT_FOUND', 'Template not found', 404));
    const res = await request(app()).delete('/api/job-templates/tpl-other');
    expect(res.status).toBe(404);
  });
});

describe('POST /:id/clone', () => {
  it('clones a template', async () => {
    cloneJobTemplate.mockResolvedValue(templateDto({ id: 'tpl2', name: 'Copy' }));
    const res = await request(app()).post('/api/job-templates/tpl1/clone').send({ name: 'Copy' });
    expect(res.status).toBe(201);
    expect(cloneJobTemplate).toHaveBeenCalledWith('t1', 'tpl1', 'Copy');
  });

  it('400s on missing name', async () => {
    const res = await request(app()).post('/api/job-templates/tpl1/clone').send({});
    expect(res.status).toBe(400);
    expect(cloneJobTemplate).not.toHaveBeenCalled();
  });
});

describe('POST /seed-defaults', () => {
  it('seeds default templates and returns the count created', async () => {
    seedDefaultTemplates.mockResolvedValue(7);
    const res = await request(app()).post('/api/job-templates/seed-defaults');
    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(7);
    expect(seedDefaultTemplates).toHaveBeenCalledWith('t1');
  });
});
