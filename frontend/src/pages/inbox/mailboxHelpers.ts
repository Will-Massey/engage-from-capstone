/**
 * Pure helpers for FirmInbox's Mailbox tab — HTML sanitisation, size
 * formatting, and sync-health copy. Kept side-effect-free so they can be
 * unit tested without rendering the component.
 */
import DOMPurify from 'dompurify';
import { formatDistance } from 'date-fns';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'b',
  'i',
  'u',
  'ul',
  'ol',
  'li',
  'a',
  'span',
  'div',
];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'class'];

/** Sanitise a message's HTML body for safe rendering. Empty/missing input -> ''. */
export function sanitizeMailHtml(html: string | null | undefined): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}

/** Human-readable file size, e.g. "12 KB" / "1.4 MB". Empty for falsy/negative input. */
export function formatAttachmentSize(bytes: number): string {
  if (!bytes || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const EMAIL_PATTERN = /[^\s<>",]+@[^\s<>",]+\.[^\s<>",]+/;

/**
 * Extracts a bare email address from a flattened display-form string, e.g.
 * "Emma Wilson Design Studio <emma@ewdesign.co.uk>" — the mailbox DTO's
 * from/to/cc fields are display strings, not bare addresses, and POSTing
 * one straight to /mailbox/send's `z.string().email()` 400s. Also accepts a
 * bare address as-is. Returns '' when nothing parseable so the caller can
 * disable send instead of firing a doomed request.
 */
export function extractEmailAddress(display: string | null | undefined): string {
  if (!display) return '';
  const match = display.match(EMAIL_PATTERN);
  return match ? match[0].trim() : '';
}

export type MailboxSyncHealth = {
  lastSyncAt: string | null;
  lastSyncOk: boolean | null;
  lastSyncError: string | null;
};

/**
 * Does this sync error look like the practice's authorisation, rather than our
 * own code failing? Only then is "reconnect" useful advice.
 *
 * The banner used to offer it for every failure. On 2026-08-11 the real fault
 * was a Prisma write error in our sync path while the connection was perfectly
 * healthy — telling the practice to reconnect would have wasted their time and
 * taught them the banner is noise. Deliberately conservative: an unrecognised
 * error offers no advice rather than the wrong advice.
 */
const AUTH_FAILURE_HINTS =
  /(token|unauthor|invalid[_ ]grant|expire|credential|AADSTS|\b401\b|\b403\b|forbidden|re-?auth)/i;

function looksLikeAuthFailure(error: string | null | undefined): boolean {
  return !!error && AUTH_FAILURE_HINTS.test(error);
}

/** Copy + tone for the mailbox health banner when a provider is connected. */
export function formatSyncHealth(
  health: MailboxSyncHealth | null | undefined,
  now: Date = new Date()
): { tone: 'success' | 'warning' | 'neutral'; message: string } {
  if (!health || health.lastSyncOk === null || health.lastSyncOk === undefined) {
    return { tone: 'neutral', message: 'Not yet synced' };
  }
  if (health.lastSyncOk === false) {
    const reason = health.lastSyncError ? `: ${health.lastSyncError}` : '';
    const advice = looksLikeAuthFailure(health.lastSyncError)
      ? ' — reconnect in Settings → Email'
      : '';
    return { tone: 'warning', message: `Sync failing${reason}${advice}` };
  }
  const when = health.lastSyncAt
    ? formatDistance(new Date(health.lastSyncAt), now, { addSuffix: true })
    : 'recently';
  return { tone: 'success', message: `Last synced ${when}` };
}
