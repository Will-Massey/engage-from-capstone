/**
 * Clara-generated post-sign onboarding checklist from signed services.
 * Stored on proposal customFields and logged to ActivityLog.
 */
import { prisma } from '../config/database.js';
import logger from '../config/logger.js';
import { AI_COPILOT } from '../config/aiCopilot.js';
import { chatCompletion, isAiConfigured, parseJsonResponse } from './ai/aiClient.js';
import { tenantUseAiEmails } from './ai/lifecycleAiEmailService.js';

export interface OnboardingChecklistItem {
  id: string;
  title: string;
  description?: string;
  category: 'aml' | 'documents' | 'systems' | 'engagement' | 'other';
  dueInDays?: number;
  completed?: boolean;
}

export interface OnboardingChecklist {
  generatedAt: string;
  source: 'ai' | 'rules';
  items: OnboardingChecklistItem[];
}

function ruleBasedChecklist(
  services: Array<{ name: string; billingFrequency?: string | null }>,
  clientName: string,
): OnboardingChecklistItem[] {
  const items: OnboardingChecklistItem[] = [
    {
      id: 'welcome',
      title: 'Send welcome email',
      description: `Confirm engagement with ${clientName} and outline next steps.`,
      category: 'engagement',
      dueInDays: 0,
    },
    {
      id: 'aml-id',
      title: 'Collect ID and AML verification',
      description: 'Request photo ID, proof of address, and complete AML checks.',
      category: 'aml',
      dueInDays: 3,
    },
    {
      id: 'auth-letter',
      title: 'HMRC agent authorisation',
      description: 'Send 64-8 or online authorisation request where applicable.',
      category: 'documents',
      dueInDays: 7,
    },
  ];

  const serviceNames = services.map((s) => s.name.toLowerCase()).join(' ');

  if (/payroll|rti|payslip/.test(serviceNames)) {
    items.push({
      id: 'payroll-setup',
      title: 'Payroll onboarding',
      description: 'Gather employee details, PAYE reference, and pension scheme information.',
      category: 'systems',
      dueInDays: 14,
    });
  }

  if (/vat|mtd|bookkeep/.test(serviceNames)) {
    items.push({
      id: 'accounting-access',
      title: 'Accounting software access',
      description: 'Invite client to Xero/QuickBooks and confirm bank feed connections.',
      category: 'systems',
      dueInDays: 10,
    });
  }

  if (/accounts|corporation tax|ct600/.test(serviceNames)) {
    items.push({
      id: 'year-end-prep',
      title: 'Year-end information request',
      description: 'Send tailored information checklist for accounts preparation.',
      category: 'documents',
      dueInDays: 21,
    });
  }

  items.push({
    id: 'kickoff',
    title: 'Schedule onboarding call',
    description: 'Book a 30-minute kick-off to confirm timelines and key contacts.',
    category: 'engagement',
    dueInDays: 5,
  });

  return items;
}

async function aiChecklist(
  tenantId: string,
  proposalId: string,
  services: Array<{ name: string; description?: string | null }>,
  clientName: string,
  practiceName: string,
): Promise<OnboardingChecklistItem[] | null> {
  if (!isAiConfigured()) return null;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  if (!tenantUseAiEmails(tenant?.settings)) return null;

  const serviceList = services.map((s) => `- ${s.name}${s.description ? `: ${s.description}` : ''}`).join('\n');

  const prompt = `Generate a concise UK accountancy client onboarding checklist after a proposal was signed.

Client: ${clientName}
Practice: ${practiceName}
Signed services:
${serviceList}

Return JSON only:
{
  "items": [
    { "title": "...", "description": "...", "category": "aml|documents|systems|engagement|other", "dueInDays": 7 }
  ]
}

5–8 practical tasks. UK English. No invented legal deadlines.`;

  try {
    const raw = await chatCompletion(
      [
        { role: 'system', content: AI_COPILOT.systemPersona },
        { role: 'user', content: prompt },
      ],
      { jsonMode: true, temperature: 0.4, maxTokens: 1200 },
    );

    const parsed = parseJsonResponse<{ items: Array<{ title: string; description?: string; category?: string; dueInDays?: number }> }>(raw.content);
    if (!parsed?.items?.length) return null;

    return parsed.items.map((item, i) => ({
      id: `ai-${i + 1}`,
      title: item.title,
      description: item.description,
      category: (['aml', 'documents', 'systems', 'engagement', 'other'].includes(item.category || '')
        ? item.category
        : 'other') as OnboardingChecklistItem['category'],
      dueInDays: item.dueInDays ?? 7,
      completed: false,
    }));
  } catch (err) {
    logger.warn('Clara onboarding checklist generation failed, using rules', err);
    return null;
  }
}

export async function generateAndStoreOnboardingChecklist(
  proposalId: string,
  tenantId: string,
): Promise<OnboardingChecklist | null> {
  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId },
    include: {
      client: true,
      tenant: { select: { name: true, settings: true } },
      services: { select: { name: true, description: true, billingFrequency: true } },
    },
  });

  if (!proposal) return null;

  let items = await aiChecklist(
    tenantId,
    proposalId,
    proposal.services,
    proposal.client.name,
    proposal.tenant.name,
  );

  const source: OnboardingChecklist['source'] = items ? 'ai' : 'rules';
  if (!items) {
    items = ruleBasedChecklist(proposal.services, proposal.client.name);
  }

  const checklist: OnboardingChecklist = {
    generatedAt: new Date().toISOString(),
    source,
    items,
  };

  let customFields: Record<string, unknown> = {};
  try {
    customFields = JSON.parse(proposal.customFields || '{}');
  } catch {
    customFields = {};
  }
  customFields.onboardingChecklist = checklist;

  await prisma.proposal.update({
    where: { id: proposalId },
    data: { customFields: JSON.stringify(customFields) },
  });

  await prisma.activityLog.create({
    data: {
      tenantId,
      action: 'ONBOARDING_CHECKLIST_GENERATED',
      entityType: 'PROPOSAL',
      entityId: proposalId,
      proposalId,
      description: `Clara onboarding checklist generated (${items.length} tasks, ${source})`,
      metadata: JSON.stringify({ source, itemCount: items.length, checklist }),
    },
  });

  logger.info(`Onboarding checklist stored for proposal ${proposalId} (${source}, ${items.length} items)`);
  return checklist;
}