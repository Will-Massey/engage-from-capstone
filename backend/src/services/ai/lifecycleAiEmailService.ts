/**
 * Lifecycle AI email generation — Clara-written client-facing emails for
 * follow-ups, acceptance, renewals, and touchpoints.
 * Falls back gracefully when AI is not configured or tenant opts out.
 */
import type { ClientLifecycleStage } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { AI_COPILOT } from '../../config/aiCopilot.js';
import { chatCompletion, isAiConfigured, parseJsonResponse } from './aiClient.js';
import { logAiUsage } from './proposalAiService.js';

const UK_SYSTEM =
  AI_COPILOT.systemPersona +
  ' Use UK English spelling (organisation, specialised, favour). ' +
  'Be professional, warm, and accurate. Never invent statutory deadlines or fees. ' +
  'When unsure, say what information is missing.';

export type LifecycleEmailTone = 'professional' | 'friendly' | 'urgent';

export interface LifecycleEmailDraft {
  subject: string;
  body: string;
  html?: string;
  source: 'ai' | 'template';
}

/** True when AI is configured and tenant has not opted out (useAiEmails !== false). */
export function tenantUseAiEmails(tenantSettingsJson?: string | null): boolean {
  if (!isAiConfigured()) return false;
  try {
    const settings = JSON.parse(tenantSettingsJson || '{}');
    return settings.useAiEmails !== false;
  } catch {
    return true;
  }
}

function textToHtml(text: string): string {
  return text.replace(/\n/g, '<br>');
}

function formatGbp(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

function frontendBaseUrl(): string {
  return (process.env.FRONTEND_URL || 'https://engagebycapstone.co.uk').replace(/\/$/, '');
}

async function loadProposalForLifecycle(tenantId: string, proposalId: string) {
  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId },
    include: {
      client: true,
      tenant: true,
      services: true,
      views: { orderBy: { viewedAt: 'desc' }, take: 10 },
      activityLogs: {
        where: {
          action: {
            in: ['FOLLOW_UP_SENT', 'PROPOSAL_SENT', 'PROPOSAL_VIEWED', 'PROPOSAL_ACCEPTED'],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 15,
      },
      createdBy: {
        select: { firstName: true, lastName: true, email: true, role: true },
      },
    },
  });
  if (!proposal) throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
  return proposal;
}

function buildViewHistorySummary(
  views: Array<{ viewedAt: Date; viewDuration?: number | null; completed?: boolean | null }>
): string {
  if (!views.length) return 'No views recorded yet.';
  return views
    .map((v, i) => {
      const date = v.viewedAt.toISOString().slice(0, 10);
      const mins = v.viewDuration ? Math.round(v.viewDuration / 60) : 0;
      const completed = v.completed ? ', completed read' : '';
      return `View ${i + 1}: ${date}${mins ? ` (${mins} min)` : ''}${completed}`;
    })
    .join('; ');
}

function buildActivitySummary(
  logs: Array<{ action: string; description?: string | null; createdAt: Date }>
): string {
  if (!logs.length) return 'No prior email activity logged.';
  return logs
    .slice(0, 8)
    .map((l) => `${l.createdAt.toISOString().slice(0, 10)} — ${l.action}: ${l.description || ''}`)
    .join('\n');
}

/** Phase 2 — AI follow-up referencing proposal views and activity history */
export async function generateFollowUpEmail(
  tenantId: string,
  proposalId: string,
  tone: LifecycleEmailTone = 'professional'
): Promise<LifecycleEmailDraft> {
  const proposal = await loadProposalForLifecycle(tenantId, proposalId);

  const now = Date.now();
  const daysSinceSent = proposal.sentAt
    ? Math.floor((now - proposal.sentAt.getTime()) / 86400000)
    : null;
  const daysUntilExpiry = Math.floor((proposal.validUntil.getTime() - now) / 86400000);
  const viewLink = `${frontendBaseUrl()}/proposals/view/${proposal.shareToken || proposal.id}`;
  const senderName = proposal.createdBy
    ? Array.from(new Set([proposal.createdBy.firstName, proposal.createdBy.lastName].filter(Boolean))).join(' ')
    : 'Partner';

  const raw = await chatCompletion(
    [
      { role: 'system', content: UK_SYSTEM },
      {
        role: 'user',
        content: `Draft a follow-up email for an unsigned UK accountancy proposal.
Tone: ${tone}
Practice: ${proposal.tenant.name}
Sender: ${senderName} (${proposal.createdBy?.role || 'Partner'})
Client: ${proposal.client.name} (${proposal.client.contactName || proposal.client.name})
Proposal: ${proposal.title} (${proposal.reference})
Total: ${formatGbp(proposal.total)}
Status: ${proposal.status}
Valid until: ${proposal.validUntil.toISOString().slice(0, 10)} (${daysUntilExpiry} days remaining)
Days since sent: ${daysSinceSent ?? 'unknown'}
Services: ${proposal.services.map((s) => s.name).join(', ')}
View history: ${buildViewHistorySummary(proposal.views)}
Prior activity:
${buildActivitySummary(proposal.activityLogs)}
Proposal link: ${viewLink}

Reference view history naturally if the client has opened the proposal (e.g. "I noticed you reviewed…"). Do not invent views.
Return JSON only: { "subject": "...", "body": "plain text email body with paragraphs separated by blank lines" }
Sign off as ${senderName} from ${proposal.tenant.name}. UK English.`,
      },
    ],
    { jsonMode: true, temperature: 0.5, maxTokens: 900 }
  );

  const draft = parseJsonResponse<{ subject: string; body: string }>(raw);
  await logAiUsage(tenantId, undefined, 'lifecycle_follow_up', { proposalId, tone });

  return {
    subject: draft.subject,
    body: draft.body,
    html: textToHtml(draft.body),
    source: 'ai',
  };
}

/** Detailed thank-you email to client after proposal acceptance */
export async function generateAcceptanceClientEmail(
  tenantId: string,
  proposalId: string
): Promise<LifecycleEmailDraft> {
  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId, status: 'ACCEPTED' },
    include: {
      client: true,
      tenant: true,
      services: true,
      createdBy: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  if (!proposal) throw new ApiError('NOT_FOUND', 'Accepted proposal not found', 404);

  const senderName = proposal.createdBy
    ? `${proposal.createdBy.firstName} ${proposal.createdBy.lastName}`
    : proposal.tenant.name;
  const servicesSummary = proposal.services
    .map(
      (s) =>
        `• ${s.name}: ${formatGbp(s.displayPrice || s.unitPrice)} per ${String(s.billingFrequency).toLowerCase().replace('_', ' ')}`
    )
    .join('\n');

  const raw = await chatCompletion(
    [
      { role: 'system', content: UK_SYSTEM },
      {
        role: 'user',
        content: `Write a detailed thank-you email to a UK accountancy client who has just accepted a proposal.
Practice: ${proposal.tenant.name}
Sender: ${senderName}
Client: ${proposal.client.name}
Proposal: ${proposal.title} (${proposal.reference})
Accepted: ${proposal.acceptedAt?.toISOString().slice(0, 10) || 'today'}
Total agreed: ${formatGbp(proposal.total)}
Services agreed:
${servicesSummary}

Include:
1. Warm thank you and confirmation of what was agreed
2. Clear next steps (onboarding, AML/ID verification if new client, engagement letter, information requests)
3. Expected timeline (team in touch within 24–48 hours)
4. Contact details for questions (${proposal.createdBy?.email || 'practice email'})

Return JSON only: { "subject": "...", "body": "plain text, 4-6 short paragraphs" }
UK English. Do not mention third-party AI.`,
      },
    ],
    { jsonMode: true, temperature: 0.55, maxTokens: 1100 }
  );

  const draft = parseJsonResponse<{ subject: string; body: string }>(raw);
  await logAiUsage(tenantId, undefined, 'lifecycle_acceptance_client', { proposalId });

  return {
    subject: draft.subject,
    body: draft.body,
    html: textToHtml(draft.body),
    source: 'ai',
  };
}

/** Renewal narrative email (client-facing) with optional fee uplift */
export async function generateRenewalEmail(
  tenantId: string,
  proposalId: string,
  upliftPercent: number = 0
): Promise<LifecycleEmailDraft> {
  const original = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId, status: 'ACCEPTED' },
    include: { client: true, tenant: true, services: true },
  });
  if (!original) throw new ApiError('NOT_FOUND', 'Accepted proposal not found', 404);

  const multiplier = 1 + upliftPercent / 100;
  const renewedFees = original.services
    .map((s) => {
      const price = Math.round((s.displayPrice || s.unitPrice) * multiplier * 100) / 100;
      return `• ${s.name}: ${formatGbp(price)} per ${String(s.billingFrequency).toLowerCase().replace('_', ' ')}`;
    })
    .join('\n');
  const priorTotal = formatGbp(original.total);
  const newTotal = formatGbp(
    original.services.reduce(
      (sum, s) => sum + Math.round((s.displayPrice || s.unitPrice) * multiplier * 100) / 100,
      0
    )
  );

  const raw = await chatCompletion(
    [
      { role: 'system', content: UK_SYSTEM },
      {
        role: 'user',
        content: `Draft an annual renewal email for a UK accountancy client.
Practice: ${original.tenant.name}
Client: ${original.client.name}
Prior proposal: ${original.title} (${original.reference}), accepted ${original.acceptedAt?.toISOString().slice(0, 10)}
Renewal date: ${original.renewalDate?.toISOString().slice(0, 10) || 'approximately 12 months from acceptance'}
Prior annual value: ${priorTotal}
${upliftPercent > 0 ? `Fees increasing by ${upliftPercent}% (new indicative total ${newTotal}) — explain professionally (inflation, regulatory burden, continued service).` : upliftPercent < 0 ? `Fees reducing by ${Math.abs(upliftPercent)}% (new indicative total ${newTotal}) — explain professionally.` : 'Fees unchanged from prior year.'}
Renewed fee lines:
${renewedFees}

Return JSON only: { "subject": "...", "body": "plain text, 3-5 paragraphs" }
Warm professional UK tone. Mention that a formal renewal proposal will follow or is attached. UK English.`,
      },
    ],
    { jsonMode: true, temperature: 0.55, maxTokens: 1000 }
  );

  const draft = parseJsonResponse<{ subject: string; body: string }>(raw);
  await logAiUsage(tenantId, undefined, 'lifecycle_renewal_email', { proposalId, upliftPercent });

  return {
    subject: draft.subject,
    body: draft.body,
    html: textToHtml(draft.body),
    source: 'ai',
  };
}

/** Touchpoint email from client lifecycle stage and merge context */
export async function generateTouchpointEmail(
  tenantId: string,
  clientId: string,
  touchpointType: ClientLifecycleStage,
  context?: Record<string, string | undefined>
): Promise<LifecycleEmailDraft> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId },
    include: {
      tenant: true,
      proposals: {
        where: { status: 'ACCEPTED' },
        orderBy: { acceptedAt: 'desc' },
        take: 1,
        select: { title: true, reference: true, total: true, services: { select: { name: true } } },
      },
    },
  });
  if (!client) throw new ApiError('CLIENT_NOT_FOUND', 'Client not found', 404);

  const accepted = client.proposals[0];
  const ctx = context || {};

  const raw = await chatCompletion(
    [
      { role: 'system', content: UK_SYSTEM },
      {
        role: 'user',
        content: `Write a client onboarding/lifecycle email for a UK accountancy practice.
Lifecycle stage: ${touchpointType}
Practice: ${client.tenant.name}
Client: ${client.name}
Contact: ${client.contactName || client.name}
Lifecycle stage: ${client.lifecycleStage}
${accepted ? `Accepted proposal: ${accepted.title} (${accepted.reference}), services: ${accepted.services.map((s) => s.name).join(', ')}` : 'No accepted proposal yet'}
Next step hint: ${ctx.next_step || 'See email body'}
Due date: ${ctx.due_date || 'not specified'}
AML portal link: ${ctx.aml_portal_link || 'n/a'}
Client portal link: ${ctx.portal_link || 'n/a'}
Extra notes: ${ctx.notes || ''}

Return JSON only: { "subject": "...", "body": "HTML email body using simple <p> and <br/> tags, no full document wrapper" }
Match the tone for stage ${touchpointType} (warm for welcome, clear for AML, professional for engagement letter).
Include merge placeholders only if links were provided above. UK English.`,
      },
    ],
    { jsonMode: true, temperature: 0.5, maxTokens: 900 }
  );

  const draft = parseJsonResponse<{ subject: string; body: string }>(raw);
  await logAiUsage(tenantId, undefined, 'lifecycle_touchpoint', {
    clientId,
    touchpointType,
  });

  const textBody = draft.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  return {
    subject: draft.subject,
    body: textBody,
    html: draft.body,
    source: 'ai',
  };
}

/** Safe wrapper — returns null if AI unavailable or generation fails */
export async function tryGenerateFollowUpEmail(
  tenantId: string,
  proposalId: string,
  tone: LifecycleEmailTone,
  tenantSettings?: string | null
): Promise<LifecycleEmailDraft | null> {
  if (!tenantUseAiEmails(tenantSettings)) return null;
  try {
    return await generateFollowUpEmail(tenantId, proposalId, tone);
  } catch {
    return null;
  }
}

export async function tryGenerateTouchpointEmail(
  tenantId: string,
  clientId: string,
  touchpointType: ClientLifecycleStage,
  context: Record<string, string | undefined>,
  tenantSettings?: string | null
): Promise<LifecycleEmailDraft | null> {
  if (!tenantUseAiEmails(tenantSettings)) return null;
  try {
    return await generateTouchpointEmail(tenantId, clientId, touchpointType, context);
  } catch {
    return null;
  }
}

/** Context for practice admin acceptance alert emails */
export interface AcceptanceAdminContext {
  practiceName: string;
  clientName: string;
  clientCompanyType: string;
  clientTurnover?: number | null;
  clientEmployees?: number | null;
  proposalTitle: string;
  proposalReference: string;
  totalAmount: string;
  serviceCount: number;
  servicesSummary: string;
  signedBy: string;
  signedByRole: string;
  signerEmail?: string | null;
  acceptedAtIso: string;
  sentAtIso?: string | null;
  hoursToSign: number | null;
  daysToSign: number | null;
  timeToSignLabel: string | null;
  viewCount: number;
  hoursFromFirstViewToSign: number | null;
  totalViewMinutes: number;
  geoLocation?: string | null;
  deviceInfo?: string | null;
  createdByName?: string | null;
  proposalUrl: string;
}

/** Phase 2 — Personalised internal alert for account admins when a client signs */
export async function generateAcceptanceAdminNotification(
  tenantId: string,
  context: AcceptanceAdminContext
): Promise<LifecycleEmailDraft> {
  const timingDetail = context.timeToSignLabel
    ? `Time from send to signature: ${context.timeToSignLabel}`
    : 'Send date not recorded';
  const viewDetail =
    context.viewCount > 0
      ? `Proposal views before signing: ${context.viewCount}${context.totalViewMinutes ? ` (~${context.totalViewMinutes} min reading)` : ''}`
      : 'No tracked views before signing';
  const firstViewDetail =
    context.hoursFromFirstViewToSign !== null
      ? `Hours from first view to signature: ${context.hoursFromFirstViewToSign}`
      : 'First view timing: n/a';

  const raw = await chatCompletion(
    [
      { role: 'system', content: UK_SYSTEM },
      {
        role: 'user',
        content: `Write a short, warm internal email body for UK accountancy practice admins — NOT to the client.
Practice: ${context.practiceName}
Client: ${context.clientName} (${context.clientCompanyType})
Proposal: ${context.proposalTitle} (${context.proposalReference})
Value: ${context.totalAmount} across ${context.serviceCount} service(s)
Signed by: ${context.signedBy} (${context.signedByRole})${context.signerEmail ? ` — ${context.signerEmail}` : ''}
Accepted: ${context.acceptedAtIso.slice(0, 16).replace('T', ' ')} UTC
${timingDetail}
${viewDetail}
${firstViewDetail}
${context.geoLocation ? `Signature location: ${context.geoLocation}` : ''}
${context.createdByName ? `Proposal created by: ${context.createdByName}` : ''}
Services: ${context.servicesSummary}

Requirements:
- 2-4 short paragraphs, UK English
- Congratulate the practice — this is a win
- Highlight ONE distinctive, personable detail (speed to sign, multiple views, client type, value, location) — use real numbers from above
- Brief practical next step (onboarding, welcome call, AML if new client)
- Do NOT include a subject line in the body
- Do NOT mention AI, Clara, or third-party models
- Plain text only

Return JSON only: { "subject": "short celebratory subject with client name", "body": "plain text body without greeting — greeting added separately" }`,
      },
    ],
    { jsonMode: true, temperature: 0.6, maxTokens: 700 }
  );

  const draft = parseJsonResponse<{ subject: string; body: string }>(raw);
  await logAiUsage(tenantId, undefined, 'acceptance_admin_notify', {
    proposalReference: context.proposalReference,
  });

  return {
    subject: draft.subject,
    body: draft.body.trim(),
    html: textToHtml(draft.body.trim()),
    source: 'ai',
  };
}

export { isAiConfigured };