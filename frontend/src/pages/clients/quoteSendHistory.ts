import { format } from 'date-fns';

/**
 * What the proposals list actually stores.
 *
 * Sent means the quote left draft: either an email went out, or someone copied
 * the client link (that also marks it sent, with no email). Viewed replaces
 * Sent after the client opens that link. It is not a second, unsent quote.
 */
export interface QuoteEmailSend {
  sentAt: string;
  to?: string;
}

export interface QuoteSendInput {
  status?: string | null;
  sentAt?: string | null;
  viewedAt?: string | null;
  lastEmailedAt?: string | null;
  emailHistory?: unknown;
}

export interface QuoteSendHistory {
  emailed: boolean;
  emails: QuoteEmailSend[];
  linkSharedAt: string | null;
  viewedAt: string | null;
  lines: string[];
}

function formatWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, 'd MMM yyyy, HH:mm');
}

export function parseQuoteEmails(raw: unknown): QuoteEmailSend[] {
  let value = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) return [];
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as { sentAt?: unknown; to?: unknown };
    if (typeof record.sentAt !== 'string' || !record.sentAt) return [];
    return [
      {
        sentAt: record.sentAt,
        ...(typeof record.to === 'string' && record.to ? { to: record.to } : {}),
      },
    ];
  });
}

export function describeQuoteSendHistory(quote: QuoteSendInput): QuoteSendHistory {
  const parsed = parseQuoteEmails(quote.emailHistory);
  const emails =
    parsed.length > 0 ? parsed : quote.lastEmailedAt ? [{ sentAt: quote.lastEmailedAt }] : [];
  const emailed = emails.length > 0;
  const viewedAt = quote.viewedAt || null;
  const linkSharedAt = !emailed && quote.sentAt && quote.status !== 'DRAFT' ? quote.sentAt : null;

  const lines: string[] = [];
  if (emailed) {
    for (const email of emails) {
      const when = formatWhen(email.sentAt) || email.sentAt;
      lines.push(email.to ? `Emailed ${when} to ${email.to}.` : `Emailed ${when}.`);
    }
  } else if (linkSharedAt) {
    const when = formatWhen(linkSharedAt) || linkSharedAt;
    lines.push(`Not emailed. The client link was copied ${when}, which marks the quote as sent.`);
  } else {
    lines.push('Not emailed.');
  }

  if (viewedAt) {
    const when = formatWhen(viewedAt) || viewedAt;
    lines.push(`Opened ${when}.`);
  }

  if (quote.status === 'VIEWED') {
    lines.push('Viewed means this quote was already sent, then the client opened it.');
  }

  return { emailed, emails, linkSharedAt, viewedAt, lines };
}
