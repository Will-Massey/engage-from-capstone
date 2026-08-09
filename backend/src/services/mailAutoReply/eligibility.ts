/**
 * Pure predicates for the AI autoreply gate. No I/O — every branch here is a
 * reason a client email does NOT get an AI reply, so each one is unit tested.
 */

export type MailAutoReplyMode = 'draft' | 'auto';

export type MailAutoReplySettings = {
  enabled: boolean;
  mode: MailAutoReplyMode;
  businessHoursOnly: boolean;
};

export const MAIL_AUTO_REPLY_DEFAULTS: MailAutoReplySettings = {
  enabled: false,
  mode: 'draft',
  businessHoursOnly: true,
};

/** Absent key, malformed JSON, or an unknown mode all mean "off / draft". */
export function parseMailAutoReplySettings(settingsJson?: string | null): MailAutoReplySettings {
  try {
    const raw = JSON.parse(settingsJson || '{}')?.mailAutoReply;
    if (!raw || typeof raw !== 'object') return { ...MAIL_AUTO_REPLY_DEFAULTS };
    return {
      enabled: raw.enabled === true,
      mode: raw.mode === 'auto' ? 'auto' : 'draft',
      businessHoursOnly: raw.businessHoursOnly !== false,
    };
  } catch {
    return { ...MAIL_AUTO_REPLY_DEFAULTS };
  }
}

const AUTOMATED_LOCAL_PARTS = [
  'no-reply',
  'noreply',
  'donotreply',
  'do-not-reply',
  'mailer-daemon',
  'postmaster',
  'bounce',
];

const AUTOMATED_SUBJECT_PREFIXES = [
  'automatic reply',
  'auto-reply',
  'out of office',
  'undeliverable',
  'delivery status notification',
];

/** Extract the bare address from "Name <a@b>" or "a@b". */
function bareAddress(input: string): string {
  const match = input.match(/<([^>]+)>/);
  return (match ? match[1] : input).trim().toLowerCase();
}

export function isAutomatedSender(fromAddress: string, subject: string): boolean {
  const addr = bareAddress(fromAddress || '');
  const local = addr.split('@')[0] || '';
  if (AUTOMATED_LOCAL_PARTS.some((p) => local.includes(p))) return true;

  const subj = (subject || '').trim().toLowerCase();
  return AUTOMATED_SUBJECT_PREFIXES.some((p) => subj.startsWith(p));
}

/**
 * Mon–Fri 08:00–17:59 Europe/London. Uses the Intl timezone so BST/GMT is
 * handled without a date library.
 */
/**
 * True when the text mentions a monetary amount.
 *
 * The number-shy rule is instructed in the prompt, but a prompt is not
 * enforcement. Any draft naming an amount — even a legitimate general figure
 * like the VAT registration threshold — buys a human read before it reaches a
 * client, so this predicate blocks AUTO-SEND only; the draft itself keeps the
 * useful content. Dates, years and small counts must not trip it.
 */
export function containsMoneyFigure(text: string): boolean {
  const body = text || '';
  if (/[£$€]\s?\d/.test(body)) return true;
  if (/\d[\d,]*(\.\d{2})?\s?(gbp|pounds?|pence)\b/i.test(body)) return true;
  // A bare decimal amount (1247.50) or any grouped thousands figure (90,000).
  if (/\b\d{1,3}(,\d{3})+(\.\d+)?\b/.test(body)) return true;
  if (/\b\d+\.\d{2}\b/.test(body)) return true;
  return false;
}

export function isWithinBusinessHours(now: Date): boolean {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '-1');
  if (['Sat', 'Sun'].includes(weekday)) return false;
  return hour >= 8 && hour < 18;
}
