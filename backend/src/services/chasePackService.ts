/**
 * UK practice chase packs — templated client emails for delivery work.
 * Used by jobs board "Send chase" and automation catalogue.
 */

export type ChasePackId =
  | 'RECORDS_REQUEST'
  | 'RECORDS_REMINDER'
  | 'VAT_DUE'
  | 'SA_DUE'
  | 'DEADLINE_APPROACHING'
  | 'PHASE_COMPLETE_UPDATE'
  | 'INFO_NUDGE';

export interface ChasePackDef {
  id: ChasePackId;
  name: string;
  description: string;
  tone: 'WARM' | 'NEUTRAL' | 'URGENT';
  /** Suggested when job is in these board columns */
  boardColumns?: string[];
  subject: string;
  bodyHtml: string;
}

export const CHASE_PACKS: ChasePackDef[] = [
  {
    id: 'RECORDS_REQUEST',
    name: 'Request records',
    description: 'First ask for books, bank statements, and period-end pack',
    tone: 'WARM',
    boardColumns: ['REQUEST_RECORDS'],
    subject: 'Records needed for {{job_title}} — {{client_name}}',
    bodyHtml: `<p>Dear {{contact_name}},</p>
<p>To keep <strong>{{client_name}}</strong> on track for <em>{{job_title}}</em>, please send the records below at your earliest convenience{{#due_date}} (ideally by <strong>{{due_date}}</strong>){{/due_date}}.</p>
<ul>
<li>Bank statements / export for the period</li>
<li>Sales invoices and purchase invoices (or bookkeeping software access)</li>
<li>Payroll summaries if applicable</li>
<li>Any other documents listed in your portal checklist</li>
</ul>
<p>You can upload securely via your client portal{{#portal_link}}: <a href="{{portal_link}}">{{portal_link}}</a>{{/portal_link}}.</p>
<p>If anything is unclear, reply to this email — we are happy to help.</p>
<p>Kind regards,<br/>{{practice_name}}</p>`,
  },
  {
    id: 'RECORDS_REMINDER',
    name: 'Records reminder',
    description: 'Friendly chase when records are still outstanding',
    tone: 'NEUTRAL',
    boardColumns: ['REQUEST_RECORDS', 'RECORDS_RECEIVED'],
    subject: 'Friendly reminder — records for {{client_name}}',
    bodyHtml: `<p>Dear {{contact_name}},</p>
<p>Just a quick reminder that we are still waiting on records for <strong>{{job_title}}</strong> for <strong>{{client_name}}</strong>.</p>
<p>{{#due_date}}Our target date is <strong>{{due_date}}</strong> — getting the pack to us soon will avoid a last-minute rush.{{/due_date}}</p>
<p>{{#portal_link}}Upload here: <a href="{{portal_link}}">{{portal_link}}</a>{{/portal_link}}</p>
<p>Thank you,<br/>{{practice_name}}</p>`,
  },
  {
    id: 'VAT_DUE',
    name: 'VAT return chase',
    description: 'Deadline-aware VAT records chase',
    tone: 'URGENT',
    subject: 'VAT return — figures needed for {{client_name}}',
    bodyHtml: `<p>Dear {{contact_name}},</p>
<p>We are preparing the VAT return for <strong>{{client_name}}</strong>{{#due_date}} with a filing target of <strong>{{due_date}}</strong>{{/due_date}}.</p>
<p>Please send (or confirm access to) sales and purchase figures, MTD software access, and any adjustments as soon as you can.</p>
<p>{{#portal_link}}Portal: <a href="{{portal_link}}">{{portal_link}}</a>{{/portal_link}}</p>
<p>Kind regards,<br/>{{practice_name}}</p>`,
  },
  {
    id: 'SA_DUE',
    name: 'Self Assessment chase',
    description: 'Personal tax information request ahead of 31 January',
    tone: 'URGENT',
    subject: 'Self Assessment — information needed for {{client_name}}',
    bodyHtml: `<p>Dear {{contact_name}},</p>
<p>To complete the Self Assessment for <strong>{{client_name}}</strong>, we need your remaining tax information{{#due_date}} (target <strong>{{due_date}}</strong>){{/due_date}}.</p>
<p>Typical items: P60/P45, self-employment accounts, dividend vouchers, property income, gift aid, and pension contributions.</p>
<p>{{#portal_link}}Secure upload: <a href="{{portal_link}}">{{portal_link}}</a>{{/portal_link}}</p>
<p>Best regards,<br/>{{practice_name}}</p>`,
  },
  {
    id: 'DEADLINE_APPROACHING',
    name: 'Deadline approaching',
    description: 'Generic statutory / internal deadline warning',
    tone: 'URGENT',
    subject: 'Deadline approaching — {{job_title}} ({{client_name}})',
    bodyHtml: `<p>Dear {{contact_name}},</p>
<p>This is a heads-up that <strong>{{job_title}}</strong> for <strong>{{client_name}}</strong> has an upcoming deadline{{#due_date}} on <strong>{{due_date}}</strong>{{/due_date}}.</p>
<p>If we are waiting on anything from your side, please send it urgently so we can protect the filing date.</p>
<p>{{#portal_link}}Portal: <a href="{{portal_link}}">{{portal_link}}</a>{{/portal_link}}</p>
<p>Kind regards,<br/>{{practice_name}}</p>`,
  },
  {
    id: 'PHASE_COMPLETE_UPDATE',
    name: 'Progress update',
    description: 'Let the client know work has moved forward',
    tone: 'WARM',
    boardColumns: ['IN_PROGRESS', 'IN_REVIEW', 'COMPLETE'],
    subject: 'Update on {{job_title}} — {{client_name}}',
    bodyHtml: `<p>Dear {{contact_name}},</p>
<p>A quick update on <strong>{{job_title}}</strong> for <strong>{{client_name}}</strong>.</p>
<p>{{#phase_name}}We have completed: <strong>{{phase_name}}</strong>.{{/phase_name}}</p>
<p>Current status: <strong>{{board_column}}</strong>. We will keep you informed of the next steps.</p>
<p>Best wishes,<br/>{{practice_name}}</p>`,
  },
  {
    id: 'INFO_NUDGE',
    name: 'Quick info nudge',
    description: 'Short one-question chase',
    tone: 'WARM',
    subject: 'Quick question on {{client_name}}',
    bodyHtml: `<p>Dear {{contact_name}},</p>
<p>We are progressing <strong>{{job_title}}</strong> and just need a quick reply from you on the outstanding item(s) we discussed.</p>
<p>A short email or portal upload is perfect — thank you.</p>
<p>Kind regards,<br/>{{practice_name}}</p>`,
  },
];

export function listChasePacks(): ChasePackDef[] {
  return CHASE_PACKS;
}

export function getChasePack(id: string): ChasePackDef | undefined {
  return CHASE_PACKS.find((p) => p.id === id);
}

/** Minimal mustache-like {{var}} and {{#var}}...{{/var}} for optional blocks */
export function renderChaseTemplate(
  template: string,
  vars: Record<string, string | null | undefined>
): string {
  let out = template;
  // Optional sections {{#key}}...{{/key}}
  out = out.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, key: string, inner: string) => {
    const v = vars[key];
    return v ? inner.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), v) : '';
  });
  // Simple vars
  out = out.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v != null ? String(v) : '';
  });
  return out;
}

export function boardColumnLabel(col: string): string {
  return col
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}
