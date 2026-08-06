/**
 * UK admin letter generators: disengagement, professional clearance, HMRC 64-8.
 * HTML bodies suitable for PDF/email; stored as PracticeLetter drafts.
 */

export type PracticeLetterType = 'DISENGAGEMENT' | 'PROFESSIONAL_CLEARANCE' | 'HMRC_64_8';

export interface LetterContext {
  practiceName: string;
  practiceAddress?: string | null;
  clientName: string;
  contactName?: string | null;
  companyNumber?: string | null;
  utr?: string | null;
  effectiveDate?: string | null; // ISO or display
  servicesSummary?: string | null;
  successorFirm?: string | null;
  reason?: string | null;
}

export function letterTitle(type: PracticeLetterType, clientName: string): string {
  switch (type) {
    case 'DISENGAGEMENT':
      return `Letter of disengagement — ${clientName}`;
    case 'PROFESSIONAL_CLEARANCE':
      return `Professional clearance — ${clientName}`;
    case 'HMRC_64_8':
      return `HMRC 64-8 agent authorisation — ${clientName}`;
    default:
      return `Letter — ${clientName}`;
  }
}

export function generateLetterHtml(type: PracticeLetterType, ctx: LetterContext): string {
  const date = ctx.effectiveDate || new Date().toLocaleDateString('en-GB');
  const contact = ctx.contactName || 'Sir/Madam';
  const firm = ctx.practiceName;

  if (type === 'DISENGAGEMENT') {
    return `<div class="practice-letter">
<p><strong>${escapeHtml(firm)}</strong></p>
${ctx.practiceAddress ? `<p>${escapeHtml(ctx.practiceAddress)}</p>` : ''}
<p>Date: ${escapeHtml(date)}</p>
<p>Dear ${escapeHtml(contact)},</p>
<p>Re: <strong>${escapeHtml(ctx.clientName)}</strong>${
      ctx.companyNumber ? ` (Company no. ${escapeHtml(ctx.companyNumber)})` : ''
    }</p>
<p>This letter confirms that we will cease to act as accountants / agents for the above client with effect from <strong>${escapeHtml(date)}</strong>.</p>
${ctx.reason ? `<p><strong>Reason:</strong> ${escapeHtml(ctx.reason)}</p>` : ''}
${ctx.servicesSummary ? `<p><strong>Services ending:</strong> ${escapeHtml(ctx.servicesSummary)}</p>` : ''}
<p>We will:</p>
<ul>
<li>Complete any work already in progress only if expressly agreed in writing and paid for;</li>
<li>Cooperate with a successor professional on receipt of a professional clearance request;</li>
<li>Return or transfer client records in line with our engagement terms and applicable law, subject to any lawful lien for unpaid fees.</li>
</ul>
<p>Please ensure HMRC / Companies House agent authorisations are updated as required. We recommend you appoint a successor promptly so filings are not missed.</p>
<p>Yours faithfully,</p>
<p><strong>${escapeHtml(firm)}</strong></p>
</div>`;
  }

  if (type === 'PROFESSIONAL_CLEARANCE') {
    return `<div class="practice-letter">
<p><strong>${escapeHtml(firm)}</strong></p>
<p>Date: ${escapeHtml(date)}</p>
<p>To: ${ctx.successorFirm ? escapeHtml(ctx.successorFirm) : 'The successor accountant'}</p>
<p>Dear Colleague,</p>
<p>Re: Professional clearance — <strong>${escapeHtml(ctx.clientName)}</strong>${
      ctx.companyNumber ? ` (${escapeHtml(ctx.companyNumber)})` : ''
    }</p>
<p>We confirm that we have acted for the above client. In response to your professional clearance enquiry:</p>
<ul>
<li>We are not aware of any reason why you should not accept the appointment, subject to your own due diligence and AML checks;</li>
<li>There ${ctx.reason ? 'are matters noted below' : 'are no unusual circumstances of which we are aware'} regarding the cessation of our appointment;</li>
<li>We will cooperate reasonably with handover of information once any outstanding fees are settled and the client has authorised disclosure.</li>
</ul>
${ctx.reason ? `<p><strong>Notes:</strong> ${escapeHtml(ctx.reason)}</p>` : ''}
<p>This letter is given in good faith and without liability for matters outside our knowledge.</p>
<p>Yours faithfully,</p>
<p><strong>${escapeHtml(firm)}</strong></p>
</div>`;
  }

  // HMRC_64_8 — guidance pack (not a live HMRC submission)
  return `<div class="practice-letter">
<p><strong>${escapeHtml(firm)}</strong></p>
<p>Date: ${escapeHtml(date)}</p>
<p>Re: HMRC form 64-8 — Authorising your agent — <strong>${escapeHtml(ctx.clientName)}</strong></p>
<p>Dear ${escapeHtml(contact)},</p>
<p>To allow us to deal with HMRC on your behalf for tax matters, please complete form <strong>64-8</strong> (or the online agent authorisation process in your HMRC account).</p>
<p><strong>Client details to check:</strong></p>
<ul>
<li>Name: ${escapeHtml(ctx.clientName)}</li>
${ctx.utr ? `<li>UTR: ${escapeHtml(ctx.utr)}</li>` : '<li>UTR: (please confirm)</li>'}
${ctx.companyNumber ? `<li>Company number: ${escapeHtml(ctx.companyNumber)}</li>` : ''}
</ul>
<p><strong>What to do:</strong></p>
<ol>
<li>Sign in to your personal or business tax account at GOV.UK, or complete a paper 64-8 if advised;</li>
<li>Authorise <strong>${escapeHtml(firm)}</strong> as your agent for the relevant taxes (Self Assessment, Corporation Tax, VAT, PAYE as applicable);</li>
<li>Notify us once submitted so we can confirm access.</li>
</ol>
<p>This document is a practice pack to track authorisation — it does not itself submit to HMRC. Keep a copy with your engagement records.</p>
<p>Kind regards,<br/><strong>${escapeHtml(firm)}</strong></p>
</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
