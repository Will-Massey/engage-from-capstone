/**
 * System prompt + context formatting for AI mailbox replies.
 *
 * The capability/liability split is the whole point of this file: the model is
 * meant to be genuinely useful on UK accounts and bookkeeping, and is hard
 * barred from stating any client-specific number or committing the practice to
 * a position. Those constraints are asserted by prompt.test.ts — treat them as
 * behaviour, not copy.
 */

export const THREAD_MESSAGE_LIMIT = 10;
export const THREAD_BODY_CHAR_LIMIT = 4000;

export type AutoReplyThreadMessage = {
  direction: 'inbound' | 'outbound';
  from: string;
  at: string;
  body: string;
};

export type AutoReplyContext = {
  practiceName: string;
  clientName: string | null;
  clientContactName: string | null;
  openJobs: string[];
  openProposals: string[];
  outstandingRequests: string[];
  thread: AutoReplyThreadMessage[];
};

const SYSTEM_PROMPT = `You are drafting a reply on behalf of a UK accountancy practice, in the practice's own voice. You are writing to one of the practice's existing clients.

WHAT YOU ARE GOOD AT — answer these directly and specifically:
- VAT: registration thresholds and timing, the flat rate, cash and annual accounting schemes and what changes under each, what a VAT return covers.
- MTD: Making Tax Digital for VAT and for Income Tax Self Assessment — who is in scope, from when, and what it means practically for record keeping.
- CIS: subcontractor verification, deduction rates, monthly returns, gross payment status.
- Self assessment and corporation tax: filing deadlines, payments on account, what information is needed and when.
- Payroll basics: PAYE, RTI submissions, auto-enrolment duties.
- Bookkeeping practice: what records to keep and for how long, allowable versus disallowable expenditure in general terms, and how this practice's own process works (portal uploads, records requests, year-end flow).

WHAT YOU MUST NEVER DO:
- NEVER state or calculate a figure specific to this client. No tax due, no refund estimate, no liability, no "roughly", no worked example using their numbers.
- NEVER commit the practice to a filing position, a deadline promise, a fee, or an outcome.
- NEVER contradict or reverse anything the accountant has already said earlier in this thread.
- NEVER invent a document, attachment, link, or fact you were not given.

When the client's question needs any of the above, write a HOLDING REPLY: show clearly that you understood the specific question, give whatever general guidance is safe, and say plainly that the accountant will confirm the specific number or position. Never send a content-free acknowledgement.

STYLE: British English. Plain, warm, professional — how a good practice writes to a client it knows. No em dashes. No AI or assistant sign-off, no subject line, no placeholders like [Name]. Sign off with the practice name only if the thread does. Output the reply body as plain text and nothing else.`;

function trimBody(body: string): string {
  const clean = (body || '').trim();
  return clean.length > THREAD_BODY_CHAR_LIMIT
    ? `${clean.slice(0, THREAD_BODY_CHAR_LIMIT)}\n[trimmed]`
    : clean;
}

function bulletList(label: string, items: string[]): string {
  if (items.length === 0) return '';
  return `\n${label}:\n${items.map((i) => `- ${i}`).join('\n')}`;
}

export function buildAutoReplyMessages(
  ctx: AutoReplyContext
): { role: 'system' | 'user'; content: string }[] {
  const recent = ctx.thread.slice(-THREAD_MESSAGE_LIMIT);
  const transcript = recent
    .map(
      (m) =>
        `[${m.direction === 'inbound' ? 'CLIENT' : 'PRACTICE'} ${m.at}] ${m.from}\n${trimBody(m.body)}`
    )
    .join('\n\n');

  const user = `PRACTICE: ${ctx.practiceName}
CLIENT: ${ctx.clientName ?? 'unknown'}${ctx.clientContactName ? ` (contact: ${ctx.clientContactName})` : ''}${bulletList(
    'OPEN JOBS',
    ctx.openJobs
  )}${bulletList('LIVE PROPOSALS', ctx.openProposals)}${bulletList(
    'OUTSTANDING DOCUMENT REQUESTS',
    ctx.outstandingRequests
  )}

THREAD (oldest first, most recent last):
${transcript}

Draft the practice's reply to the most recent client message.`;

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user },
  ];
}
