/**
 * AI-generated proposal send emails — UK English, approval required before send.
 */
import { prisma } from '../../config/database.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { AI_COPILOT } from '../../config/aiCopilot.js';
import { chatCompletion, chatCompletionStream, parseJsonResponse, checkAiTokenBudget } from './aiClient.js';
import { buildAiContext } from './aiContextBuilder.js';
import { logAiUsage } from './proposalAiService.js';

const UK_SYSTEM =
  AI_COPILOT.systemPersona +
  ' Use UK English spelling (organisation, specialised, favour). ' +
  'Be professional, concise, and accurate. Never invent statutory deadlines or fees. ' +
  'When unsure, say what information is missing.';

export interface ProposalEmailDraftInput {
  clientId: string;
  title?: string;
  reference?: string;
  coverLetter?: string;
  validUntil?: string;
  viewLink?: string;
  services: Array<{
    name: string;
    billingFrequency?: string;
    displayPrice?: number;
  }>;
  senderName?: string;
  senderEmail?: string;
  practiceName?: string;
}

export interface ProposalSendEmailResult {
  subject: string;
  htmlBody: string;
  textBody: string;
  requiresApproval: true;
}

function escapeHtml(text: string): string {
  const div = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, (m) => div[m as keyof typeof div]);
}

function formatBilling(freq?: string): string {
  if (!freq) return 'monthly';
  return freq.toLowerCase().replace(/_/g, ' ');
}

function formatGbp(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

function formatValidUntil(raw?: string): string {
  if (!raw) return 'as stated in the proposal';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function buildServiceTableText(
  services: Array<{ name: string; billingFrequency?: string; displayPrice?: number }>
): string {
  if (!services.length) return '(No services listed)';
  const lines = services.map((s) => {
    const price = s.displayPrice != null ? formatGbp(s.displayPrice) : 'TBC';
    return `• ${s.name}: ${price} (${formatBilling(s.billingFrequency)})`;
  });
  return lines.join('\n');
}

function wrapAiEmailHtml(params: {
  tenantName: string;
  clientName: string;
  proposalTitle: string;
  proposalReference: string;
  validUntil: string;
  senderName: string;
  senderPosition?: string;
  senderEmail: string;
  bodyHtml: string;
  viewLink?: string;
  totalAmount?: string;
}): string {
  const ctaBlock = params.viewLink
    ? `<div style="text-align: center;">
        <a href="${params.viewLink}" style="display: inline-block; background: #0ea5e9; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0;">View Full Proposal</a>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proposal from ${escapeHtml(params.tenantName)}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); padding: 30px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 24px; }
    .header p { color: #e0f2fe; margin: 10px 0 0 0; }
    .content { padding: 30px; }
    .proposal-box { background: #f8fafc; border-left: 4px solid #0ea5e9; padding: 20px; margin: 20px 0; border-radius: 0 4px 4px 0; }
    .proposal-title { font-size: 20px; font-weight: bold; color: #0f172a; margin-bottom: 10px; }
    .proposal-ref { color: #64748b; font-size: 14px; }
    .validity { background: #fef3c7; border: 1px solid #fbbf24; padding: 12px; border-radius: 4px; margin: 20px 0; font-size: 14px; }
    .footer { background: #f8fafc; padding: 20px 30px; text-align: center; color: #64748b; font-size: 14px; }
    .footer a { color: #0ea5e9; }
    .signature { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
    .service-table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
    .service-table th, .service-table td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
    .service-table th { background: #f1f5f9; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${escapeHtml(params.tenantName)}</h1>
      <p>Professional Accounting Services</p>
    </div>
    <div class="content">
      <div class="proposal-box">
        <div class="proposal-title">${escapeHtml(params.proposalTitle)}</div>
        <div class="proposal-ref">Reference: ${escapeHtml(params.proposalReference)}</div>
        ${params.totalAmount ? `<div style="margin-top: 10px; font-size: 18px; color: #0ea5e9; font-weight: bold;">Total: ${escapeHtml(params.totalAmount)}</div>` : ''}
      </div>
      ${params.bodyHtml}
      ${ctaBlock}
      <div class="validity">
        <strong>Valid until:</strong> ${escapeHtml(params.validUntil)}<br>
        Please review and respond before this date to ensure availability.
      </div>
      <div class="signature">
        <p>Best regards,</p>
        <p><strong>${escapeHtml(params.senderName)}</strong><br>
        ${params.senderPosition ? `${escapeHtml(params.senderPosition)}<br>` : ''}
        ${escapeHtml(params.tenantName)}<br>
        <a href="mailto:${params.senderEmail}">${escapeHtml(params.senderEmail)}</a></p>
      </div>
    </div>
    <div class="footer">
      <p>This proposal was sent via <strong>Engage by Capstone</strong></p>
      ${params.viewLink ? `<p style="font-size: 12px; margin-top: 10px;"><a href="${params.viewLink}">View Proposal Online</a></p>` : ''}
    </div>
  </div>
</body>
</html>`;
}

function servicesToHtmlTable(
  services: Array<{ name: string; billingFrequency?: string; displayPrice?: number }>
): string {
  if (!services.length) return '';
  const rows = services
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(formatBilling(s.billingFrequency))}</td><td>${s.displayPrice != null ? escapeHtml(formatGbp(s.displayPrice)) : 'TBC'}</td></tr>`
    )
    .join('');
  return `<table class="service-table"><thead><tr><th>Service</th><th>Billing</th><th>Fee</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function assertAiBudget(tenantId: string): Promise<void> {
  const budget = await checkAiTokenBudget(tenantId);
  if (!budget.withinBudget) {
    throw new ApiError(
      'AI_BUDGET_EXCEEDED',
      `${AI_COPILOT.name} monthly usage limit reached — contact your administrator`,
      429
    );
  }
}

async function generateEmailContent(
  tenantId: string,
  userId: string | undefined,
  payload: {
    clientName: string;
    contactName?: string | null;
    tenantName: string;
    proposalTitle: string;
    proposalReference: string;
    validUntil: string;
    services: Array<{ name: string; billingFrequency?: string; displayPrice?: number }>;
    total: number;
    senderName: string;
    senderEmail: string;
    senderPosition?: string;
    viewLink?: string;
    coverLetter?: string | null;
    contextNote?: string;
  },
  logMeta: Record<string, unknown>
): Promise<ProposalSendEmailResult> {
  await assertAiBudget(tenantId);

  const serviceTableText = buildServiceTableText(payload.services);
  const validUntilFormatted = formatValidUntil(payload.validUntil);
  const totalFormatted = formatGbp(payload.total);

  const raw = await chatCompletion(
    [
      { role: 'system', content: UK_SYSTEM },
      {
        role: 'user',
        content: `Draft the main body paragraphs for a UK accountancy proposal send email (not the signature or footer).
Explain who you are, why you are writing, summarise services, mention fees, next steps, and valid until date.
Use plain paragraphs only — no markdown, no HTML, no subject line.
3-5 short paragraphs. Warm professional UK tone. Address ${payload.contactName || payload.clientName}.

Proposal: ${payload.proposalTitle} (${payload.proposalReference})
Practice: ${payload.tenantName}
Sender: ${payload.senderName}
Valid until: ${validUntilFormatted}
Total fees: ${totalFormatted}

Services (plain text table):
${serviceTableText}
${payload.coverLetter ? `\nCover letter context:\n${payload.coverLetter.slice(0, 800)}` : ''}
${payload.contextNote ? `\n${payload.contextNote}` : ''}

Return JSON only:
{ "subject": "concise email subject", "bodyParagraphs": "plain text paragraphs separated by blank lines", "nextSteps": ["step1", "step2"] }`,
      },
    ],
    { jsonMode: true, temperature: 0.5, maxTokens: 1200 }
  );

  const parsed = parseJsonResponse<{
    subject: string;
    bodyParagraphs: string;
    nextSteps?: string[];
  }>(raw);

  const bodyParagraphsHtml = parsed.bodyParagraphs
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('\n');

  const nextStepsHtml =
    parsed.nextSteps?.length ?
      `<p><strong>Next steps:</strong></p><ul>${parsed.nextSteps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>`
    : '';

  const bodyHtml = `${bodyParagraphsHtml}\n${servicesToHtmlTable(payload.services)}\n${nextStepsHtml}`;

  const textBody = [
    `Dear ${payload.contactName || payload.clientName},`,
    '',
    parsed.bodyParagraphs,
    '',
    'SERVICES',
    '========',
    serviceTableText,
    '',
    `Total: ${totalFormatted}`,
    '',
    parsed.nextSteps?.length ? `Next steps:\n${parsed.nextSteps.map((s) => `• ${s}`).join('\n')}` : '',
    '',
    `Valid until: ${validUntilFormatted}`,
    payload.viewLink ? `\nView proposal: ${payload.viewLink}` : '',
    '',
    'Best regards,',
    payload.senderName,
    payload.tenantName,
    payload.senderEmail,
    '',
    '---',
    'Sent via Engage by Capstone',
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  const htmlBody = wrapAiEmailHtml({
    tenantName: payload.tenantName,
    clientName: payload.clientName,
    proposalTitle: payload.proposalTitle,
    proposalReference: payload.proposalReference,
    validUntil: validUntilFormatted,
    senderName: payload.senderName,
    senderPosition: payload.senderPosition,
    senderEmail: payload.senderEmail,
    bodyHtml,
    viewLink: payload.viewLink,
    totalAmount: totalFormatted,
  });

  await logAiUsage(tenantId, userId, 'proposal_send_email', logMeta);

  return {
    subject: parsed.subject?.trim() || `Proposal: ${payload.proposalTitle} — ${payload.proposalReference}`,
    htmlBody,
    textBody,
    requiresApproval: true,
  };
}

/** Streaming version for live email preview. Yields body chunks. Subject is generated first (cheap). */
export async function* generateEmailContentStream(
  tenantId: string,
  userId: string | undefined,
  payload: {
    clientName: string;
    contactName?: string | null;
    tenantName: string;
    proposalTitle: string;
    proposalReference: string;
    validUntil: string;
    services: Array<{ name: string; billingFrequency?: string; displayPrice?: number }>;
    total: number;
    senderName: string;
    senderEmail: string;
    senderPosition?: string;
    viewLink?: string;
    coverLetter?: string | null;
    contextNote?: string;
  },
  logMeta: Record<string, unknown>
): AsyncGenerator<{ subject?: string; bodyChunk?: string; done?: boolean }, ProposalSendEmailResult, unknown> {
  await assertAiBudget(tenantId);

  const serviceTableText = buildServiceTableText(payload.services);
  const validUntilFormatted = formatValidUntil(payload.validUntil);
  const totalFormatted = formatGbp(payload.total);

  // First, get the subject (very cheap, low token)
  const subjectRaw = await chatCompletion(
    [
      { role: 'system', content: UK_SYSTEM },
      {
        role: 'user',
        content: `Write ONLY a concise, professional email subject line for this UK accountancy proposal.
Proposal: ${payload.proposalTitle} (${payload.proposalReference})
Client: ${payload.contactName || payload.clientName}
Practice: ${payload.tenantName}
Do not add quotes or extra text.`,
      },
    ],
    { temperature: 0.4, maxTokens: 60 }
  );

  const subject = subjectRaw.trim().replace(/^["']|["']$/g, '') || `Proposal: ${payload.proposalTitle} — ${payload.proposalReference}`;
  yield { subject };

  // Now stream the body paragraphs
  const bodyPrompt = `Draft the main body paragraphs for a UK accountancy proposal send email (not the signature or footer).
Explain who you are, why you are writing, summarise services, mention fees, next steps, and valid until date.
Use plain paragraphs only — no markdown, no HTML, no subject line.
3-5 short paragraphs. Warm professional UK tone. Address ${payload.contactName || payload.clientName}.

Proposal: ${payload.proposalTitle} (${payload.proposalReference})
Practice: ${payload.tenantName}
Sender: ${payload.senderName}
Valid until: ${validUntilFormatted}
Total fees: ${totalFormatted}

Services (plain text table):
${serviceTableText}
${payload.coverLetter ? `\nCover letter context:\n${payload.coverLetter.slice(0, 800)}` : ''}
${payload.contextNote ? `\n${payload.contextNote}` : ''}

Output ONLY the body paragraphs, separated by blank lines. No JSON, no subject.`;

  let bodyParagraphs = '';

  for await (const chunk of chatCompletionStream(
    [
      { role: 'system', content: UK_SYSTEM },
      { role: 'user', content: bodyPrompt },
    ],
    { temperature: 0.5, maxTokens: 900 }
  )) {
    bodyParagraphs += chunk;
    yield { bodyChunk: chunk };
  }

  // Now build the final HTML / text like before
  const bodyParagraphsHtml = bodyParagraphs
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('\n');

  // We need nextSteps too for completeness — do a cheap follow-up or parse from body if present.
  // For min tokens, we'll skip structured nextSteps in streaming or do a tiny call.
  // Simple: just use paragraphs.
  const bodyHtml = `${bodyParagraphsHtml}\n${servicesToHtmlTable(payload.services)}`;

  const textBody = [
    `Dear ${payload.contactName || payload.clientName},`,
    '',
    bodyParagraphs,
    '',
    'SERVICES',
    '========',
    serviceTableText,
    '',
    `Total: ${totalFormatted}`,
    '',
    `Valid until: ${validUntilFormatted}`,
    payload.viewLink ? `\nView proposal: ${payload.viewLink}` : '',
    '',
    'Best regards,',
    payload.senderName,
    payload.tenantName,
    payload.senderEmail,
    '',
    '---',
    'Sent via Engage by Capstone',
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  const htmlBody = wrapAiEmailHtml({
    tenantName: payload.tenantName,
    clientName: payload.clientName,
    proposalTitle: payload.proposalTitle,
    proposalReference: payload.proposalReference,
    validUntil: validUntilFormatted,
    senderName: payload.senderName,
    senderPosition: payload.senderPosition,
    senderEmail: payload.senderEmail,
    bodyHtml,
    viewLink: payload.viewLink,
    totalAmount: totalFormatted,
  });

  await logAiUsage(tenantId, userId, 'proposal_send_email', logMeta);

  const result: ProposalSendEmailResult = {
    subject,
    htmlBody,
    textBody,
    requiresApproval: true,
  };

  yield { done: true };
  return result;
}

/** Generate a detailed send email for an existing proposal */
export async function generateProposalSendEmail(
  tenantId: string,
  userId: string | undefined,
  proposalId: string
): Promise<ProposalSendEmailResult> {
  const ctx = await buildAiContext(tenantId, { proposalId, userId });
  if (!ctx.proposal || !ctx.client) {
    throw new ApiError('NOT_FOUND', 'Proposal or client not found', 404);
  }

  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId },
    include: { createdBy: true },
  });
  if (!proposal) throw new ApiError('NOT_FOUND', 'Proposal not found', 404);

  const senderName = ctx.user
    ? Array.from(new Set([ctx.user.firstName, ctx.user.lastName].filter(Boolean))).join(' ')
    : Array.from(new Set([proposal.createdBy.firstName, proposal.createdBy.lastName].filter(Boolean))).join(' ');
  const senderEmail = ctx.user?.email ?? proposal.createdBy.email;

  return generateEmailContent(
    tenantId,
    userId,
    {
      clientName: ctx.client.name,
      contactName: ctx.client.contactName,
      tenantName: ctx.tenant.name,
      proposalTitle: ctx.proposal.title,
      proposalReference: ctx.proposal.reference,
      validUntil: ctx.proposal.validUntil,
      services: ctx.proposal.services,
      total: ctx.proposal.total,
      senderName,
      senderEmail,
      senderPosition: ctx.user?.jobTitle ?? ctx.user?.role ?? proposal.createdBy.role,
      coverLetter: ctx.proposal.coverLetter,
    },
    { proposalId }
  );
}

/** Generate a send email for an unsaved proposal draft */
export async function generateProposalSendEmailFromDraft(
  tenantId: string,
  userId: string | undefined,
  draft: ProposalEmailDraftInput
): Promise<ProposalSendEmailResult> {
  const ctx = await buildAiContext(tenantId, { clientId: draft.clientId, userId });
  if (!ctx.client) throw new ApiError('CLIENT_NOT_FOUND', 'Client not found', 404);

  const services = draft.services || [];
  const total = services.reduce((sum, s) => sum + (s.displayPrice ?? 0), 0);
  const senderName =
    draft.senderName ||
    (ctx.user ? Array.from(new Set([ctx.user.firstName, ctx.user.lastName].filter(Boolean))).join(' ') : 'Partner');
  const senderEmail = draft.senderEmail || ctx.user?.email || '';

  return generateEmailContent(
    tenantId,
    userId,
    {
      clientName: ctx.client.name,
      contactName: ctx.client.contactName,
      tenantName: draft.practiceName || ctx.tenant.name,
      proposalTitle: draft.title || `Proposal for ${ctx.client.name}`,
      proposalReference: draft.reference || 'Draft',
      validUntil: draft.validUntil || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      services,
      total,
      senderName,
      senderEmail,
      senderPosition: ctx.user?.jobTitle ?? ctx.user?.role,
      viewLink: draft.viewLink,
      coverLetter: draft.coverLetter,
      contextNote: 'This is a draft proposal not yet saved in Engage.',
    },
    { clientId: draft.clientId, draft: true }
  );
}