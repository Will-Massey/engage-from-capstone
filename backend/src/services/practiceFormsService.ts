/**
 * Bulk practice forms — templates in tenant.settings, assignments/submissions in ActivityLog.
 * Portal clients complete assigned forms; staff assign to many clients at once.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../config/database.js';

export type FormFieldType = 'text' | 'textarea' | 'boolean' | 'select' | 'date' | 'number';

export type FormField = {
  id: string;
  type: FormFieldType;
  label: string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
};

export type FormTemplate = {
  id: string;
  name: string;
  description: string;
  category: string;
  fields: FormField[];
  isActive: boolean;
  createdAt: string;
};

export type FormAssignment = {
  id: string;
  templateId: string;
  templateName: string;
  clientId: string;
  clientName?: string;
  status: 'pending' | 'submitted';
  assignedAt: string;
  submittedAt?: string | null;
  dueAt?: string | null;
  answers?: Record<string, unknown>;
};

function parseSettings(raw: string | null | undefined): Record<string, any> {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function parseMeta(raw: string | null | undefined): Record<string, any> {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

/** UK default packs — installed on first list if empty */
export const DEFAULT_FORM_TEMPLATES: Omit<FormTemplate, 'createdAt'>[] = [
  {
    id: 'tpl_records_pack',
    name: 'Records pack',
    description: 'Bank statements, software, VAT scheme, payroll readiness',
    category: 'Onboarding',
    isActive: true,
    fields: [
      { id: 'bank_ready', type: 'boolean', label: 'Bank statements ready (12 months)', required: true },
      {
        id: 'software',
        type: 'select',
        label: 'Bookkeeping software',
        options: ['Xero', 'QuickBooks', 'Sage', 'Excel', 'None', 'Other'],
        required: true,
      },
      {
        id: 'vat_scheme',
        type: 'select',
        label: 'VAT scheme',
        options: ['Not registered', 'Standard', 'Flat rate', 'Cash accounting', 'Other'],
      },
      { id: 'payroll', type: 'boolean', label: 'We run payroll' },
      { id: 'notes', type: 'textarea', label: 'Anything else we should know?' },
    ],
  },
  {
    id: 'tpl_sa_checklist',
    name: 'Self Assessment checklist',
    description: 'Income sources and documents for SA season',
    category: 'Tax',
    isActive: true,
    fields: [
      { id: 'employment', type: 'boolean', label: 'Employment income (P60 / P45)' },
      { id: 'self_employed', type: 'boolean', label: 'Self-employed / sole trader' },
      { id: 'property', type: 'boolean', label: 'Property income' },
      { id: 'dividends', type: 'boolean', label: 'Dividends / investments' },
      { id: 'cis', type: 'boolean', label: 'CIS deductions' },
      {
        id: 'docs_ready',
        type: 'select',
        label: 'Document readiness',
        options: ['All ready', 'Mostly ready', 'Need more time'],
        required: true,
      },
      { id: 'notes', type: 'textarea', label: 'Notes for your accountant' },
    ],
  },
  {
    id: 'tpl_vat_return',
    name: 'VAT return prep',
    description: 'Figures and adjustments for the next VAT return',
    category: 'VAT',
    isActive: true,
    fields: [
      { id: 'period_end', type: 'date', label: 'Period end date', required: true },
      { id: 'sales', type: 'number', label: 'Total sales (ex VAT) £' },
      { id: 'purchases', type: 'number', label: 'Total purchases (ex VAT) £' },
      { id: 'fuel_scale', type: 'boolean', label: 'Fuel scale charge applies' },
      { id: 'bad_debt', type: 'boolean', label: 'Bad debt relief claims' },
      { id: 'notes', type: 'textarea', label: 'Unusual items this period' },
    ],
  },
  {
    id: 'tpl_id_kyc',
    name: 'ID & address verification',
    description: 'Basic KYC questions before AML partner flow',
    category: 'Compliance',
    isActive: true,
    fields: [
      { id: 'full_name', type: 'text', label: 'Full legal name', required: true },
      { id: 'dob', type: 'date', label: 'Date of birth', required: true },
      { id: 'address', type: 'textarea', label: 'Current address', required: true },
      {
        id: 'id_type',
        type: 'select',
        label: 'ID document type',
        options: ['Passport', 'Driving licence', 'National ID', 'Other'],
        required: true,
      },
      { id: 'id_number', type: 'text', label: 'Document number (last 4 digits ok)' },
    ],
  },
  {
    id: 'tpl_year_end',
    name: 'Year-end questionnaire',
    description: 'Directors, stock, loans, and related-party notes',
    category: 'Accounts',
    isActive: true,
    fields: [
      { id: 'year_end', type: 'date', label: 'Accounting year end', required: true },
      { id: 'stock', type: 'boolean', label: 'We hold stock / inventory' },
      { id: 'director_loan', type: 'boolean', label: 'Director loan account activity' },
      { id: 'related_party', type: 'boolean', label: 'Related-party transactions' },
      { id: 'notes', type: 'textarea', label: 'Events after the balance sheet date' },
    ],
  },
];

async function loadTemplates(tenantId: string): Promise<FormTemplate[]> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  const settings = parseSettings(tenant?.settings);
  const list = settings.practiceForms?.templates;
  if (Array.isArray(list) && list.length > 0) {
    return list as FormTemplate[];
  }

  // Seed defaults
  const seeded: FormTemplate[] = DEFAULT_FORM_TEMPLATES.map((t) => ({
    ...t,
    createdAt: new Date().toISOString(),
  }));
  settings.practiceForms = { ...(settings.practiceForms || {}), templates: seeded };
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: JSON.stringify(settings) },
  });
  return seeded;
}

async function saveTemplates(tenantId: string, templates: FormTemplate[]): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  const settings = parseSettings(tenant?.settings);
  settings.practiceForms = { ...(settings.practiceForms || {}), templates };
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: JSON.stringify(settings) },
  });
}

export async function listFormTemplates(tenantId: string): Promise<FormTemplate[]> {
  return loadTemplates(tenantId);
}

export async function saveFormTemplate(
  tenantId: string,
  input: Partial<FormTemplate> & { name: string; fields: FormField[] }
): Promise<FormTemplate> {
  const templates = await loadTemplates(tenantId);
  const now = new Date().toISOString();
  if (input.id) {
    const idx = templates.findIndex((t) => t.id === input.id);
    if (idx >= 0) {
      templates[idx] = {
        ...templates[idx],
        name: input.name,
        description: input.description ?? templates[idx].description,
        category: input.category ?? templates[idx].category,
        fields: input.fields,
        isActive: input.isActive !== false,
      };
      await saveTemplates(tenantId, templates);
      return templates[idx];
    }
  }
  const created: FormTemplate = {
    id: input.id || `tpl_${randomUUID().slice(0, 8)}`,
    name: input.name,
    description: input.description || '',
    category: input.category || 'Custom',
    fields: input.fields,
    isActive: input.isActive !== false,
    createdAt: now,
  };
  templates.push(created);
  await saveTemplates(tenantId, templates);
  return created;
}

export async function listAssignments(
  tenantId: string,
  opts: { clientId?: string; status?: string } = {}
): Promise<FormAssignment[]> {
  const rows = await prisma.activityLog.findMany({
    where: {
      tenantId,
      action: 'FORM_ASSIGNMENT',
      ...(opts.clientId ? { entityId: opts.clientId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const clientIds = [...new Set(rows.map((r) => r.entityId).filter(Boolean) as string[])];
  const clients =
    clientIds.length > 0
      ? await prisma.client.findMany({
          where: { tenantId, id: { in: clientIds } },
          select: { id: true, name: true },
        })
      : [];
  const cmap = new Map(clients.map((c) => [c.id, c.name]));

  let list: FormAssignment[] = rows.map((r) => {
    const m = parseMeta(r.metadata);
    return {
      id: r.id,
      templateId: String(m.templateId || ''),
      templateName: String(m.templateName || 'Form'),
      clientId: r.entityId || '',
      clientName: cmap.get(r.entityId || '') || undefined,
      status: m.status === 'submitted' ? 'submitted' : 'pending',
      assignedAt: r.createdAt.toISOString(),
      submittedAt: m.submittedAt ? String(m.submittedAt) : null,
      dueAt: m.dueAt ? String(m.dueAt) : null,
      answers: (m.answers as Record<string, unknown>) || undefined,
    };
  });

  if (opts.status === 'pending' || opts.status === 'submitted') {
    list = list.filter((a) => a.status === opts.status);
  }
  return list;
}

export async function assignFormBulk(params: {
  tenantId: string;
  templateId: string;
  clientIds: string[];
  userId?: string | null;
  /** Days until due (client portal shows urgency) */
  dueInDays?: number | null;
  /** Re-open submitted as new pending (bulk resend) */
  forceResend?: boolean;
}): Promise<{ assigned: number; skipped: number; assignments: FormAssignment[] }> {
  const templates = await loadTemplates(params.tenantId);
  const tpl = templates.find((t) => t.id === params.templateId && t.isActive);
  if (!tpl) throw new Error('Template not found or inactive');

  const clients = await prisma.client.findMany({
    where: {
      tenantId: params.tenantId,
      id: { in: params.clientIds },
      isActive: true,
    },
    select: { id: true, name: true },
  });

  // Skip clients who already have a pending assignment for this template
  const existing = await listAssignments(params.tenantId);
  const pendingKeys = new Set(
    existing
      .filter((a) => a.status === 'pending' && a.templateId === tpl.id)
      .map((a) => a.clientId)
  );

  let assigned = 0;
  let skipped = 0;
  const created: FormAssignment[] = [];
  const dueAt =
    params.dueInDays != null && params.dueInDays > 0
      ? new Date(Date.now() + params.dueInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

  for (const c of clients) {
    if (!params.forceResend && pendingKeys.has(c.id)) {
      skipped++;
      continue;
    }
    const row = await prisma.activityLog.create({
      data: {
        tenantId: params.tenantId,
        action: 'FORM_ASSIGNMENT',
        entityType: 'CLIENT',
        entityId: c.id,
        description: `Form assigned: ${tpl.name}`,
        metadata: JSON.stringify({
          templateId: tpl.id,
          templateName: tpl.name,
          status: 'pending',
          fields: tpl.fields,
          answers: null,
          submittedAt: null,
          dueAt,
          resent: !!params.forceResend,
        }),
        userId: params.userId || null,
      },
    });
    created.push({
      id: row.id,
      templateId: tpl.id,
      templateName: tpl.name,
      clientId: c.id,
      clientName: c.name,
      status: 'pending',
      assignedAt: row.createdAt.toISOString(),
      dueAt,
    });
    assigned++;
  }

  return { assigned, skipped, assignments: created };
}

/** Nudge: re-assign pending forms that are past due (creates reminder note on assignment metadata) */
export async function remindOverdueForms(
  tenantId: string
): Promise<{ reminded: number }> {
  const list = await listAssignments(tenantId, { status: 'pending' });
  const now = Date.now();
  let reminded = 0;
  for (const a of list) {
    const due = a.dueAt ? new Date(a.dueAt).getTime() : 0;
    const stale =
      due > 0
        ? due < now
        : now - new Date(a.assignedAt).getTime() > 7 * 24 * 60 * 60 * 1000;
    if (!stale) continue;
    const row = await prisma.activityLog.findFirst({
      where: { id: a.id, tenantId },
    });
    if (!row) continue;
    const m = parseMeta(row.metadata);
    m.lastReminderAt = new Date().toISOString();
    m.reminderCount = Number(m.reminderCount || 0) + 1;
    await prisma.activityLog.update({
      where: { id: row.id },
      data: {
        metadata: JSON.stringify(m),
        description: `Form reminder: ${a.templateName} (${m.reminderCount}×)`,
      },
    });
    reminded++;
  }
  return { reminded };
}

export async function listPortalFormsForClient(
  tenantId: string,
  clientId: string
): Promise<
  Array<
    FormAssignment & {
      fields: FormField[];
      description: string;
    }
  >
> {
  const templates = await loadTemplates(tenantId);
  const tmap = new Map(templates.map((t) => [t.id, t]));
  const rows = await prisma.activityLog.findMany({
    where: {
      tenantId,
      action: 'FORM_ASSIGNMENT',
      entityId: clientId,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return rows.map((r) => {
    const m = parseMeta(r.metadata);
    const tpl = tmap.get(String(m.templateId || ''));
    return {
      id: r.id,
      templateId: String(m.templateId || ''),
      templateName: String(m.templateName || tpl?.name || 'Form'),
      clientId,
      status: m.status === 'submitted' ? ('submitted' as const) : ('pending' as const),
      assignedAt: r.createdAt.toISOString(),
      submittedAt: m.submittedAt ? String(m.submittedAt) : null,
      dueAt: m.dueAt ? String(m.dueAt) : null,
      answers: (m.answers as Record<string, unknown>) || undefined,
      fields: (Array.isArray(m.fields) ? m.fields : tpl?.fields || []) as FormField[],
      description: tpl?.description || '',
    };
  });
}

export async function submitPortalForm(params: {
  tenantId: string;
  clientId: string;
  assignmentId: string;
  answers: Record<string, unknown>;
}): Promise<FormAssignment> {
  const row = await prisma.activityLog.findFirst({
    where: {
      id: params.assignmentId,
      tenantId: params.tenantId,
      entityId: params.clientId,
      action: 'FORM_ASSIGNMENT',
    },
  });
  if (!row) throw new Error('Assignment not found');

  const m = parseMeta(row.metadata);
  const submittedAt = new Date().toISOString();
  m.status = 'submitted';
  m.submittedAt = submittedAt;
  m.answers = params.answers;

  await prisma.activityLog.update({
    where: { id: row.id },
    data: {
      metadata: JSON.stringify(m),
      description: `Form submitted: ${m.templateName || 'Form'}`,
    },
  });

  // Notify open jobs
  const openJobs = await prisma.job.findMany({
    where: {
      tenantId: params.tenantId,
      clientId: params.clientId,
      isActive: true,
      boardColumn: { not: 'COMPLETE' },
    },
    select: { id: true },
    take: 10,
  });
  if (openJobs.length) {
    await prisma.jobActivity.createMany({
      data: openJobs.map((j) => ({
        kind: 'NOTE',
        message: `Client submitted form: ${m.templateName || 'Form'}`,
        jobId: j.id,
        metadata: JSON.stringify({ formAssignmentId: row.id, templateId: m.templateId }),
      })),
    });
  }

  return {
    id: row.id,
    templateId: String(m.templateId || ''),
    templateName: String(m.templateName || 'Form'),
    clientId: params.clientId,
    status: 'submitted',
    assignedAt: row.createdAt.toISOString(),
    submittedAt,
    answers: params.answers,
  };
}
