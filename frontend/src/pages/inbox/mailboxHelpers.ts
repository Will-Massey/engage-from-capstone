/**
 * Pure helpers for FirmInbox's Mailbox tab — HTML sanitisation, size
 * formatting, and sync-health copy. Kept side-effect-free so they can be
 * unit tested without rendering the component.
 */
import DOMPurify from 'dompurify';
import { formatDistance } from 'date-fns';

const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 'ul', 'ol', 'li', 'a', 'span', 'div'];
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

export type MailboxSyncHealth = {
  lastSyncAt: string | null;
  lastSyncOk: boolean | null;
  lastSyncError: string | null;
};

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
    return { tone: 'warning', message: `Sync failing${reason} — reconnect in Settings → Email` };
  }
  const when = health.lastSyncAt
    ? formatDistance(new Date(health.lastSyncAt), now, { addSuffix: true })
    : 'recently';
  return { tone: 'success', message: `Last synced ${when}` };
}
