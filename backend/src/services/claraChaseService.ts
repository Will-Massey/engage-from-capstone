/**
 * W2.3 — Clara drafts or rewrites a client chase in firm voice.
 * Facts stay template/job-derived; the LLM only writes prose. Falls back to a
 * chase pack when AI is off or the model fails.
 */
import { chatCompletion, isAiConfigured } from './ai/aiClient.js';
import { getVoiceOfPracticePromptContext } from './voiceOfPracticeService.js';
import { boardColumnLabel, getChasePack, renderChaseTemplate } from './chasePackService.js';

export type ChaseDraft = {
  subject: string;
  bodyHtml: string;
  source: 'clara' | 'template';
};

export type JobChaseContext = {
  tenantId: string;
  practiceName: string;
  job: {
    title: string;
    reference: string;
    boardColumn: string;
    dueAt: Date | null;
    client: { name: string; contactName: string | null; contactEmail?: string | null };
  };
  phaseName?: string;
  openPhases?: string[];
  openChecks?: string[];
  previous?: { subject: string; bodyHtml: string } | null;
};

export type ProposalChaseContext = {
  tenantId: string;
  practiceName: string;
  proposal: {
    title: string;
    reference: string;
    client: { name: string; contactName: string | null };
  };
  previous?: { subject: string; bodyHtml: string } | null;
};

function packForJobColumn(column: string) {
  return (
    getChasePack(column === 'REQUEST_RECORDS' ? 'RECORDS_REQUEST' : 'DEADLINE_APPROACHING') ||
    getChasePack('INFO_NUDGE')!
  );
}

function templateJobDraft(ctx: JobChaseContext): ChaseDraft {
  const pack = packForJobColumn(ctx.job.boardColumn);
  const vars = {
    contact_name: ctx.job.client.contactName || 'Client',
    client_name: ctx.job.client.name,
    job_title: ctx.job.title,
    practice_name: ctx.practiceName,
    due_date: ctx.job.dueAt?.toLocaleDateString('en-GB') || null,
    phase_name: ctx.phaseName || ctx.openPhases?.[0] || null,
    board_column: boardColumnLabel(ctx.job.boardColumn),
  };
  return {
    subject: renderChaseTemplate(pack.subject, vars),
    bodyHtml: renderChaseTemplate(pack.bodyHtml, vars),
    source: 'template',
  };
}

function templateProposalDraft(ctx: ProposalChaseContext): ChaseDraft {
  const pack = getChasePack('DEADLINE_APPROACHING') || getChasePack('INFO_NUDGE')!;
  const vars = {
    contact_name: ctx.proposal.client.contactName || 'Client',
    client_name: ctx.proposal.client.name,
    job_title: ctx.proposal.title,
    practice_name: ctx.practiceName,
    due_date: null,
    phase_name: null,
    board_column: 'Proposal unsigned',
  };
  return {
    subject: renderChaseTemplate(pack.subject, vars),
    bodyHtml: renderChaseTemplate(pack.bodyHtml, vars),
    source: 'template',
  };
}

async function askClara(system: string, user: string): Promise<ChaseDraft | null> {
  if (!isAiConfigured()) return null;
  try {
    const result = await chatCompletion(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { jsonMode: true, temperature: 0.4, maxTokens: 800 }
    );
    const parsed = JSON.parse(result.content) as { subject?: string; bodyHtml?: string };
    if (!parsed.subject || !parsed.bodyHtml) return null;
    return { subject: parsed.subject, bodyHtml: parsed.bodyHtml, source: 'clara' };
  } catch {
    return null;
  }
}

export async function draftJobChase(ctx: JobChaseContext): Promise<ChaseDraft> {
  const fallback = templateJobDraft(ctx);
  const voice = await getVoiceOfPracticePromptContext(ctx.tenantId);
  const facts = [
    `Practice: ${ctx.practiceName}`,
    `Client: ${ctx.job.client.name}`,
    `Contact: ${ctx.job.client.contactName || 'n/a'}`,
    `Job: ${ctx.job.title} (${ctx.job.reference})`,
    `Board column: ${ctx.job.boardColumn}`,
    `Due: ${ctx.job.dueAt?.toISOString().slice(0, 10) || 'none'}`,
    `Open phases: ${(ctx.openPhases || []).join('; ') || 'none'}`,
    `Open checklist: ${(ctx.openChecks || []).slice(0, 12).join('; ') || 'none'}`,
  ].join('\n');

  const system =
    'You are Clara, a UK accountancy practice co-pilot. Write a concise professional client email in UK English. Return JSON only: {"subject":"...","bodyHtml":"<p>...</p>"}. Be warm, clear, and specific about next steps. No legal advice. Do not invent fees, deadlines, or statutory dates.' +
    voice;

  const user = ctx.previous
    ? `Rewrite this chase in the firm's voice. Keep every fact; improve clarity and tone.\nFacts:\n${facts}\n\nCurrent subject: ${ctx.previous.subject}\nCurrent body HTML:\n${ctx.previous.bodyHtml}`
    : `Draft a chase / progress email for this delivery job:\n${facts}`;

  return (await askClara(system, user)) || fallback;
}

export async function draftProposalChase(ctx: ProposalChaseContext): Promise<ChaseDraft> {
  const fallback = templateProposalDraft(ctx);
  const voice = await getVoiceOfPracticePromptContext(ctx.tenantId);
  const facts = [
    `Practice: ${ctx.practiceName}`,
    `Client: ${ctx.proposal.client.name}`,
    `Contact: ${ctx.proposal.client.contactName || 'n/a'}`,
    `Proposal: ${ctx.proposal.title} (${ctx.proposal.reference})`,
    `Status: sent, unsigned for 7+ days`,
  ].join('\n');

  const system =
    'You are Clara, a UK accountancy practice co-pilot. Write a concise professional follow-up about an unsigned proposal in UK English. Return JSON only: {"subject":"...","bodyHtml":"<p>...</p>"}. Warm, no pressure-selling, no invented fees.' +
    voice;

  const user = ctx.previous
    ? `Rewrite this unsigned-proposal chase in the firm's voice. Keep facts.\n${facts}\n\nCurrent subject: ${ctx.previous.subject}\nCurrent body HTML:\n${ctx.previous.bodyHtml}`
    : `Draft a short follow-up asking the client to review and sign this proposal:\n${facts}`;

  return (await askClara(system, user)) || fallback;
}

export function parseChaseDraftMetadata(raw: string | null | undefined): {
  subject: string;
  bodyHtml: string;
  source?: string;
} | null {
  try {
    const parsed = JSON.parse(raw || '{}') as {
      subject?: string;
      bodyHtml?: string;
      source?: string;
    };
    if (!parsed.subject || !parsed.bodyHtml) return null;
    return { subject: parsed.subject, bodyHtml: parsed.bodyHtml, source: parsed.source };
  } catch {
    return null;
  }
}
