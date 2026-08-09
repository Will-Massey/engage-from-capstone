/**
 * Practice form templates: default seeding, create/update semantics, and the
 * settings-preservation guarantee (template writes must never clobber
 * unrelated tenant settings keys).
 */
const prismaMock = {
  tenant: { findUnique: jest.fn(), update: jest.fn() },
  activityLog: { findMany: jest.fn(), create: jest.fn() },
  client: { findMany: jest.fn() },
};

jest.mock('../../config/database.js', () => ({ prisma: prismaMock }));

import {
  listFormTemplates,
  saveFormTemplate,
  DEFAULT_FORM_TEMPLATES,
} from '../practiceFormsService.js';

const TENANT = 'tenant-1';

function mockSettings(settings: Record<string, unknown>) {
  prismaMock.tenant.findUnique.mockResolvedValue({ settings: JSON.stringify(settings) });
}

/** The settings object the service last persisted via tenant.update. */
function lastSavedSettings(): Record<string, any> {
  const calls = prismaMock.tenant.update.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return JSON.parse(calls[calls.length - 1][0].data.settings);
}

const customTemplate = {
  id: 'tpl_custom01',
  name: 'VAT onboarding',
  description: 'VAT scheme questionnaire',
  category: 'Custom',
  isActive: true,
  createdAt: '2026-08-01T00:00:00.000Z',
  fields: [{ id: 'vat_scheme', type: 'select' as const, label: 'VAT scheme', options: ['FRS'] }],
};

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.tenant.update.mockResolvedValue({});
});

describe('listFormTemplates', () => {
  it('seeds the UK default packs on first read and persists them', async () => {
    mockSettings({});
    const templates = await listFormTemplates(TENANT);
    expect(templates.map((t) => t.id)).toEqual(DEFAULT_FORM_TEMPLATES.map((t) => t.id));
    expect(lastSavedSettings().practiceForms.templates).toHaveLength(DEFAULT_FORM_TEMPLATES.length);
  });

  it('returns stored templates without rewriting settings', async () => {
    mockSettings({ practiceForms: { templates: [customTemplate] } });
    const templates = await listFormTemplates(TENANT);
    expect(templates).toEqual([customTemplate]);
    expect(prismaMock.tenant.update).not.toHaveBeenCalled();
  });
});

describe('saveFormTemplate', () => {
  it('creates a new template with a generated tpl_ id and appends it', async () => {
    mockSettings({ practiceForms: { templates: [customTemplate] } });
    const created = await saveFormTemplate(TENANT, {
      name: 'Payroll pack',
      fields: [{ id: 'staff_count', type: 'number', label: 'How many staff?' }],
    });
    expect(created.id).toMatch(/^tpl_[0-9a-f]{8}$/);
    expect(created.isActive).toBe(true);
    const saved = lastSavedSettings().practiceForms.templates;
    expect(saved).toHaveLength(2);
    expect(saved[1].name).toBe('Payroll pack');
  });

  it('updates an existing template in place by id', async () => {
    mockSettings({ practiceForms: { templates: [customTemplate] } });
    const updated = await saveFormTemplate(TENANT, {
      id: customTemplate.id,
      name: 'VAT onboarding v2',
      fields: customTemplate.fields,
      isActive: false,
    });
    expect(updated.name).toBe('VAT onboarding v2');
    expect(updated.isActive).toBe(false);
    const saved = lastSavedSettings().practiceForms.templates;
    expect(saved).toHaveLength(1);
    expect(saved[0].createdAt).toBe(customTemplate.createdAt);
  });

  it('preserves unrelated tenant settings keys on template writes', async () => {
    mockSettings({
      accountFlowMesh: { mode: 'live', allowLive: true },
      automationSchedule: 'daily',
      practiceForms: { templates: [customTemplate], somethingElse: 'kept' },
    });
    await saveFormTemplate(TENANT, {
      name: 'New pack',
      fields: [{ id: 'q1', type: 'text', label: 'Question' }],
    });
    const saved = lastSavedSettings();
    expect(saved.accountFlowMesh).toEqual({ mode: 'live', allowLive: true });
    expect(saved.automationSchedule).toBe('daily');
    expect(saved.practiceForms.somethingElse).toBe('kept');
  });
});
