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
 * "12.30" and "2024" are genuinely ambiguous in isolation — a clock time and
 * a fee look identical, as do a year and a bill. No pattern can resolve that
 * ambiguity from the number alone, so this does NOT strip or pre-remove
 * date/time/year-shaped text and then scan what's left (that approach ate
 * real amounts like "the fee is 12.30" and "Your bill is 2024"). Instead it
 * classifies by CONTEXT — evidence that a number is money, found anywhere in
 * the text:
 *   1. a currency symbol/word sits with a number (£, $, €, gbp, pound(s),
 *      pence, or a trailing "p" as in "50p");
 *   2. grouped thousands (1,234 or 90,000) — flagged even for non-money
 *      counts like "12,500 transactions", which is an acceptable false
 *      positive given the bias toward flagging;
 *   3. a money-context word (fee, bill, invoice, cost, owed, balance, due,
 *      pay, total, price, quote, salary, turnover, ...) appears anywhere
 *      alongside any number anywhere.
 * A bare 2-decimal-place number on its own is deliberately NOT a signal —
 * that's what wrongly caught clock times like "14.30".
 */
const MONEY_CONTEXT_WORDS = [
  'fee',
  'fees',
  'bill',
  'billed',
  'invoice',
  'invoiced',
  'charge',
  'charged',
  'cost',
  'costs',
  'owed',
  'owing',
  'balance',
  'due',
  'pay',
  'payable',
  'payment',
  'paid',
  'refund',
  'rebate',
  'liability',
  'total',
  'amount',
  'price',
  'quote',
  'quoted',
  'deposit',
  'instalment',
  'installment',
  'salary',
  'wage',
  'wages',
  'turnover',
  'profit',
  'loss',
  'expense',
  'expenses',
  'worth',
  'sum',
];

const MONEY_CONTEXT_WORD_RE = new RegExp(`\\b(${MONEY_CONTEXT_WORDS.join('|')})\\b`, 'i');

/** Currency symbol directly against a digit: £1,247.50, $90, €12. */
function hasCurrencySymbol(text: string): boolean {
  return /[£$€]\s?\d/.test(text);
}

/** A number next to a currency word: "90,000 GBP", "12 pounds", "50p". */
function hasCurrencyWord(text: string): boolean {
  return /\b\d[\d,]*(\.\d+)?\s?(gbp|pounds?|pence)\b|\b\d[\d,]*(\.\d+)?p\b/i.test(text);
}

/** Grouped thousands: 1,234 or 90,000, with or without a decimal tail. */
function hasGroupedThousands(text: string): boolean {
  return /\b\d{1,3}(,\d{3})+(\.\d+)?\b/.test(text);
}

/** A money-context word (fee, bill, owed, ...) anywhere alongside any number. */
function hasMoneyContextWordWithNumber(text: string): boolean {
  return MONEY_CONTEXT_WORD_RE.test(text) && /\d/.test(text);
}

export function containsMoneyFigure(text: string): boolean {
  const body = text || '';
  return (
    hasCurrencySymbol(body) ||
    hasCurrencyWord(body) ||
    hasGroupedThousands(body) ||
    hasMoneyContextWordWithNumber(body)
  );
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
