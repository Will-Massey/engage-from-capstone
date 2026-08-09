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

const AUTOMATED_LOCAL_PARTS = ['noreply', 'donotreply', 'mailerdaemon', 'postmaster', 'bounce'];

const AUTOMATED_SUBJECT_PREFIXES = [
  'automatic reply',
  'auto-reply',
  'auto reply',
  'autoreply',
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
  const local = (addr.split('@')[0] || '').replace(/[^a-z0-9]/g, '');
  if (AUTOMATED_LOCAL_PARTS.some((p) => local.startsWith(p))) return true;

  const subj = (subject || '').trim().toLowerCase();
  return AUTOMATED_SUBJECT_PREFIXES.some((p) => subj.startsWith(p));
}

/**
 * True when the text mentions a monetary amount.
 *
 * The number-shy rule is instructed in the prompt, but a prompt is not
 * enforcement. Any draft naming an amount — even a legitimate general figure
 * like the VAT registration threshold — buys a human read before it reaches a
 * client, so this predicate blocks AUTO-SEND only; the draft itself keeps the
 * useful content. Dates, years and small counts must not trip it.
 *
 * Strategy: strip out patterns that are definitely NOT money (times, dates,
 * standalone years) first, then look for money signals in what remains — a
 * currency symbol or word, grouped thousands, a 2-decimal-place number, or a
 * bare integer of 100 or more. Small counts under 100 stay unflagged.
 */
export function containsMoneyFigure(text: string): boolean {
  const body = text || '';
  if (/[£$€]\s?\d/.test(body)) return true;
  if (/\d[\d,]*(\.\d{2})?\s?(gbp|pounds?|pence)\b/i.test(body)) return true;

  const normalised = body
    // Times: hh:mm or hh.mm, hours 0-23, minutes 00-59.
    .replace(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g, ' ')
    // Dates: dd/mm/yyyy, dd.mm.yyyy, dd-mm-yyyy.
    .replace(/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, ' ')
    // Standalone 4-digit years, 1900-2100.
    .replace(/\b(19\d{2}|20\d{2}|2100)\b/g, ' ');

  // Grouped thousands (90,000) or a 2-decimal-place figure (1247.50).
  if (/\b\d{1,3}(,\d{3})+(\.\d+)?\b/.test(normalised)) return true;
  if (/\b\d+\.\d{2}\b/.test(normalised)) return true;

  // A bare integer of 100 or more is treated as a possible amount.
  const bareIntegers = normalised.match(/\b\d+\b/g) || [];
  return bareIntegers.some((n) => Number(n) >= 100);
}

/**
 * Mon–Fri 08:00–17:59 Europe/London. Uses the Intl timezone so BST/GMT is
 * handled without a date library.
 */
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
