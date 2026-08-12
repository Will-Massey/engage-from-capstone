/**
 * Job template CRUD: nested phases/items persistence + ordering, wholesale
 * replace on update, tenant isolation (cross-tenant reads/writes 404 —
 * never leak existence), delete-in-use guard, duplicate-name 409, and
 * idempotent seedDefaultTemplates.
 */
const prismaMock = {
  jobTemplate: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  jobTemplatePhase: {
    deleteMany: jest.fn(),
  },
  jobRecurrence: {
    count: jest.fn(),
  },
  $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => fn(prismaMock)),
};

jest.mock('../../config/database.js', () => ({ prisma: prismaMock }));

import {
  listJobTemplates,
  getJobTemplate,
  createJobTemplate,
  updateJobTemplate,
  deleteJobTemplate,
  cloneJobTemplate,
  seedDefaultTemplates,
} from '../jobTemplateService.js';

function templateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tpl1',
    tenantId: 't1',
    name: 'Year End Accounts',
    description: null,
    serviceCategory: 'COMPLIANCE',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    phases: [
      {
        id: 'ph1',
        name: 'Request records',
        sortOrder: 0,
        items: [
          { id: 'it1', label: 'Send checklist', sortOrder: 0 },
          { id: 'it2', label: 'Chase missing items', sortOrder: 1 },
        ],
      },
      {
        id: 'ph2',
        name: 'Preparation',
        sortOrder: 1,
        items: [{ id: 'it3', label: 'Draft accounts', sortOrder: 0 }],
      },
    ],
    ...overrides,
  };
}

const validInput = {
  name: 'Year End Accounts',
  description: 'Standard year-end job',
  serviceCategory: 'COMPLIANCE',
  isActive: true,
  phases: [
    {
      name: 'Request records',
      sortOrder: 0,
      items: [
        { label: 'Send checklist', sortOrder: 0 },
        { label: 'Chase missing items', sortOrder: 1 },
      ],
    },
    {
      name: 'Preparation',
      sortOrder: 1,
      items: [{ label: 'Draft accounts', sortOrder: 0 }],
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) =>
    fn(prismaMock)
  );
});

describe('listJobTemplates', () => {
  it('filters by tenantId and returns phases/items ordered by sortOrder', async () => {
    prismaMock.jobTemplate.findMany.mockResolvedValue([templateRow()]);
    const result = await listJobTemplates('t1');
    expect(prismaMock.jobTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 't1' },
        include: expect.objectContaining({
          phases: expect.objectContaining({
            orderBy: { sortOrder: 'asc' },
            include: expect.objectContaining({
              items: expect.objectContaining({ orderBy: { sortOrder: 'asc' } }),
            }),
          }),
        }),
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0].phases[0].items.map((i) => i.label)).toEqual([
      'Send checklist',
      'Chase missing items',
    ]);
  });
});

describe('getJobTemplate', () => {
  it('returns null when not found', async () => {
    prismaMock.jobTemplate.findFirst.mockResolvedValue(null);
    const result = await getJobTemplate('t1', 'missing');
    expect(result).toBeNull();
  });

  it('scopes the lookup by tenantId — cross-tenant returns null, not the row', async () => {
    prismaMock.jobTemplate.findFirst.mockResolvedValue(null);
    const result = await getJobTemplate('t-other', 'tpl1');
    expect(result).toBeNull();
    expect(prismaMock.jobTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tpl1', tenantId: 't-other' } })
    );
  });

  it('returns the dto when found within the tenant', async () => {
    prismaMock.jobTemplate.findFirst.mockResolvedValue(templateRow());
    const result = await getJobTemplate('t1', 'tpl1');
    expect(result?.name).toBe('Year End Accounts');
    expect(result?.phases).toHaveLength(2);
  });
});

describe('createJobTemplate', () => {
  it('persists nested phases/items ordered by sortOrder', async () => {
    prismaMock.jobTemplate.findFirst.mockResolvedValue(null); // name available
    prismaMock.jobTemplate.create.mockResolvedValue(templateRow());

    const result = await createJobTemplate('t1', validInput);

    expect(prismaMock.jobTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 't1',
          name: 'Year End Accounts',
          phases: {
            create: [
              expect.objectContaining({
                name: 'Request records',
                sortOrder: 0,
                items: {
                  create: [
                    { label: 'Send checklist', sortOrder: 0 },
                    { label: 'Chase missing items', sortOrder: 1 },
                  ],
                },
              }),
              expect.objectContaining({
                name: 'Preparation',
                sortOrder: 1,
                items: { create: [{ label: 'Draft accounts', sortOrder: 0 }] },
              }),
            ],
          },
        }),
      })
    );
    expect(result.phases).toHaveLength(2);
  });

  it('409s when the name already exists in the same tenant', async () => {
    prismaMock.jobTemplate.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(createJobTemplate('t1', validInput)).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.jobTemplate.create).not.toHaveBeenCalled();
    expect(prismaMock.jobTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 't1', name: validInput.name }),
      })
    );
  });

  it('allows the same name in a different tenant', async () => {
    prismaMock.jobTemplate.findFirst.mockResolvedValue(null);
    prismaMock.jobTemplate.create.mockResolvedValue(templateRow({ tenantId: 't2' }));
    await expect(createJobTemplate('t2', validInput)).resolves.toBeTruthy();
    expect(prismaMock.jobTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 't2' }) })
    );
  });
});

describe('updateJobTemplate', () => {
  it('replaces phases wholesale — deletes existing phases (cascades items) then recreates, no orphans', async () => {
    prismaMock.jobTemplate.findFirst.mockResolvedValueOnce({ id: 'tpl1' }); // existence check
    prismaMock.jobTemplate.findFirst.mockResolvedValueOnce(null); // name-available check
    prismaMock.jobTemplatePhase.deleteMany.mockResolvedValue({ count: 2 });
    prismaMock.jobTemplate.update.mockResolvedValue(templateRow());

    const result = await updateJobTemplate('t1', 'tpl1', validInput);

    expect(prismaMock.jobTemplatePhase.deleteMany).toHaveBeenCalledWith({
      where: { templateId: 'tpl1' },
    });
    expect(prismaMock.jobTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tpl1' },
        data: expect.objectContaining({
          phases: expect.objectContaining({ create: expect.any(Array) }),
        }),
      })
    );
    // deleteMany must happen before update (no orphan window)
    const deleteOrder = prismaMock.jobTemplatePhase.deleteMany.mock.invocationCallOrder[0];
    const updateOrder = prismaMock.jobTemplate.update.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(updateOrder);
    expect(result.name).toBe('Year End Accounts');
  });

  it('cross-tenant update returns not-found, never leaking existence', async () => {
    prismaMock.jobTemplate.findFirst.mockResolvedValue(null);
    await expect(updateJobTemplate('t-other', 'tpl1', validInput)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(prismaMock.jobTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tpl1', tenantId: 't-other' } })
    );
    expect(prismaMock.jobTemplatePhase.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.jobTemplate.update).not.toHaveBeenCalled();
  });

  it('409s renaming to a name already used by another template in the tenant', async () => {
    prismaMock.jobTemplate.findFirst.mockResolvedValueOnce({ id: 'tpl1' });
    prismaMock.jobTemplate.findFirst.mockResolvedValueOnce({ id: 'tpl2' });
    await expect(updateJobTemplate('t1', 'tpl1', validInput)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(prismaMock.jobTemplate.update).not.toHaveBeenCalled();
  });
});

describe('deleteJobTemplate', () => {
  it('refuses (IN_USE, 409) while an active recurrence references it', async () => {
    prismaMock.jobTemplate.findFirst.mockResolvedValue({ id: 'tpl1' });
    prismaMock.jobRecurrence.count.mockResolvedValue(1);
    await expect(deleteJobTemplate('t1', 'tpl1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'IN_USE',
    });
    expect(prismaMock.jobTemplate.delete).not.toHaveBeenCalled();
  });

  it('deletes when no active recurrence references it', async () => {
    prismaMock.jobTemplate.findFirst.mockResolvedValue({ id: 'tpl1' });
    prismaMock.jobRecurrence.count.mockResolvedValue(0);
    prismaMock.jobTemplate.delete.mockResolvedValue({});
    await deleteJobTemplate('t1', 'tpl1');
    expect(prismaMock.jobTemplate.delete).toHaveBeenCalledWith({ where: { id: 'tpl1' } });
  });

  it('cross-tenant delete returns not-found, never leaking existence', async () => {
    prismaMock.jobTemplate.findFirst.mockResolvedValue(null);
    await expect(deleteJobTemplate('t-other', 'tpl1')).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.jobRecurrence.count).not.toHaveBeenCalled();
    expect(prismaMock.jobTemplate.delete).not.toHaveBeenCalled();
  });
});

describe('cloneJobTemplate', () => {
  it('clones phases/items under the new name', async () => {
    prismaMock.jobTemplate.findFirst.mockResolvedValueOnce(templateRow()); // source lookup
    prismaMock.jobTemplate.findFirst.mockResolvedValueOnce(null); // name-available check
    prismaMock.jobTemplate.create.mockResolvedValue(
      templateRow({ id: 'tpl2', name: 'Year End Accounts (Copy)' })
    );

    const result = await cloneJobTemplate('t1', 'tpl1', 'Year End Accounts (Copy)');

    expect(prismaMock.jobTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 't1',
          name: 'Year End Accounts (Copy)',
          phases: expect.objectContaining({ create: expect.any(Array) }),
        }),
      })
    );
    expect(result.name).toBe('Year End Accounts (Copy)');
  });

  it('cross-tenant clone source returns not-found', async () => {
    prismaMock.jobTemplate.findFirst.mockResolvedValue(null);
    await expect(cloneJobTemplate('t-other', 'tpl1', 'Copy')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(prismaMock.jobTemplate.create).not.toHaveBeenCalled();
  });
});

describe('seedDefaultTemplates', () => {
  it('creates one template per catalogue category on first run', async () => {
    prismaMock.jobTemplate.findFirst.mockResolvedValue(null); // nothing exists yet
    prismaMock.jobTemplate.create.mockResolvedValue(templateRow());

    const created = await seedDefaultTemplates('t1');

    expect(created).toBeGreaterThan(0);
    expect(prismaMock.jobTemplate.create).toHaveBeenCalledTimes(created);
    for (const call of prismaMock.jobTemplate.create.mock.calls) {
      expect(call[0].data.tenantId).toBe('t1');
    }
  });

  it('is idempotent — running twice does not duplicate', async () => {
    // First run: nothing exists.
    prismaMock.jobTemplate.findFirst.mockResolvedValue(null);
    prismaMock.jobTemplate.create.mockResolvedValue(templateRow());
    const firstRun = await seedDefaultTemplates('t1');
    expect(firstRun).toBeGreaterThan(0);

    // Second run: everything already exists.
    jest.clearAllMocks();
    prismaMock.jobTemplate.findFirst.mockResolvedValue({ id: 'existing' });

    const secondRun = await seedDefaultTemplates('t1');
    expect(secondRun).toBe(0);
    expect(prismaMock.jobTemplate.create).not.toHaveBeenCalled();
  });
});
