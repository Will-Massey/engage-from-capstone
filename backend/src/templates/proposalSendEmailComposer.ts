/**
 * Compose proposal send emails — always includes the e-sign portal link.
 * PDF attachment is for the client's records; the portal is the primary action.
 */

import { generateProposalEmailTemplate, type ProposalEmailData } from './proposalEmail.js';

export interface ProposalSendComposeParams {
  clientName: string;
  proposalTitle: string;
  proposalReference: string;
  viewLink: string;
  senderName: string;
  senderPosition?: string;
  senderEmail: string;
  tenantName: string;
  validUntil: string;
  totalAmount?: string;
  serviceCount?: number;
  aiHtml?: string;
  aiText?: string;
  aiSubject?: string;
}

function escapeHtml(text: string): string {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, (m) => map[m as keyof typeof map]);
}

/** Prominent signing portal block — injected into every proposal send email. */
export function buildSigningPortalSection(viewLink: string, clientName: string): { html: string; text: string } {
  const html = `
      <div style="background: #eff6ff; border: 2px solid #0ea5e9; border-radius: 8px; padding: 24px; margin: 28px 0; text-align: center;">
        <p style="margin: 0 0 8px; font-size: 18px; font-weight: bold; color: #0f172a;">Review and sign electronically</p>
        <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #334155;">
          Dear ${escapeHtml(clientName)}, please use our secure online portal to read the full proposal,
          ask questions if needed, and sign when you are ready. This is the quickest way to accept our services.
        </p>
        <a href="${viewLink}" style="display: inline-block; background: #0284c7; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin-bottom: 12px;">
          Open secure signing portal
        </a>
        <p style="margin: 16px 0 0; font-size: 13px; line-height: 1.5; color: #64748b;">
          Or copy this link into your browser:<br>
          <a href="${viewLink}" style="color: #0284c7; word-break: break-all;">${viewLink}</a>
        </p>
        <p style="margin: 16px 0 0; font-size: 13px; color: #64748b;">
          A PDF copy is attached for your records — you do not need to print or return it.
        </p>
      </div>`;

  const text = `
REVIEW AND SIGN ELECTRONICALLY
==============================
Dear ${clientName},

Please use our secure online portal to read the full proposal and sign electronically when you are ready:

${viewLink}

A PDF copy is attached for your records — you do not need to print or return it.
`.trim();

  return { html, text };
}

function textToHtmlParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin: 0 0 16px; font-size: 15px; line-height: 1.65; color: #334155;">${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function wrapAiBodyInShell(
  params: ProposalSendComposeParams,
  bodyHtml: string,
  portalHtml: string
): string {
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
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${escapeHtml(params.tenantName)}</h1>
      <p>Proposal for your review</p>
    </div>
    <div class="content">
      <div class="proposal-box">
        <div class="proposal-title">${escapeHtml(params.proposalTitle)}</div>
        <div class="proposal-ref">Reference: ${escapeHtml(params.proposalReference)}</div>
        ${params.totalAmount ? `<div style="margin-top: 10px; font-size: 18px; color: #0ea5e9; font-weight: bold;">Total: ${escapeHtml(params.totalAmount)}</div>` : ''}
        ${params.serviceCount ? `<div style="margin-top: 5px; color: #64748b;">${params.serviceCount} service${params.serviceCount > 1 ? 's' : ''} included</div>` : ''}
      </div>
      ${portalHtml}
      ${bodyHtml}
      <div class="validity">
        <strong>Valid until:</strong> ${escapeHtml(params.validUntil)}<br>
        Please review and sign via the portal before this date.
      </div>
      <div class="signature">
        <p>Best regards,</p>
        <p><strong>${escapeHtml(params.senderName)}</strong><br>
        ${params.senderPosition ? `${escapeHtml(params.senderPosition)}<br>` : ''}
        ${escapeHtml(params.tenantName)}<br>
        <a href="mailto:${params.senderEmail}">${params.senderEmail}</a></p>
      </div>
    </div>
    <div class="footer">
      <p>This proposal was sent via <strong>Engage by Capstone</strong></p>
      <p style="font-size: 12px; margin-top: 10px;"><a href="${params.viewLink}">Open signing portal</a></p>
    </div>
  </div>
</body>
</html>`;
}

/** Build final HTML/text/subject for a proposal send — portal link is always included. */
export function composeProposalSendEmail(params: ProposalSendComposeParams): {
  subject: string;
  html: string;
  text: string;
} {
  const subject =
    params.aiSubject?.trim() ||
    `Proposal for ${params.clientName}: ${params.proposalTitle} (${params.proposalReference})`;

  const portal = buildSigningPortalSection(params.viewLink, params.clientName);

  if (params.aiHtml?.trim() || params.aiText?.trim()) {
    const bodyHtml = params.aiHtml?.trim()
      ? params.aiHtml.includes('<')
        ? params.aiHtml
        : textToHtmlParagraphs(params.aiHtml)
      : textToHtmlParagraphs(params.aiText || '');

    const html = wrapAiBodyInShell(params, bodyHtml, portal.html);
    const aiPlain = params.aiText?.trim() || '';
    const text = [aiPlain, portal.text].filter(Boolean).join('\n\n');

    return { subject, html, text };
  }

  const templateData: ProposalEmailData = {
    clientName: params.clientName,
    proposalTitle: params.proposalTitle,
    proposalReference: params.proposalReference,
    viewLink: params.viewLink,
    senderName: params.senderName,
    senderPosition: params.senderPosition,
    senderEmail: params.senderEmail,
    validUntil: params.validUntil,
    tenantName: params.tenantName,
    totalAmount: params.totalAmount,
    serviceCount: params.serviceCount,
  };

  return {
    subject,
    ...generateProposalEmailTemplate(templateData),
  };
}

/** Sanitise PDF attachment filename and validate buffer. */
export function prepareProposalPdfAttachment(
  buffer: Buffer | undefined,
  reference: string
): { filename: string; content: Buffer; contentType: string } | undefined {
  if (!buffer || buffer.length < 5) return undefined;
  const header = buffer.subarray(0, 5).toString('ascii');
  if (!header.startsWith('%PDF')) {
    return undefined;
  }
  const safeRef = reference.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'proposal';
  return {
    filename: `Proposal-${safeRef}-for-your-records.pdf`,
    content: buffer,
    contentType: 'application/pdf',
  };
}