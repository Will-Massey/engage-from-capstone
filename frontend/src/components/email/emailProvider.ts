export type EmailProvider = 'smtp' | 'gmail' | 'outlook' | 'microsoft365';

/** Providers that represent a connected OAuth mailbox (two-way Inbox sync). */
export type MailboxProvider = 'microsoft365' | 'gmail' | 'outlook';

const OAUTH_PROVIDERS: MailboxProvider[] = ['gmail', 'outlook', 'microsoft365'];

export function isOAuthMailboxProvider(provider: string | null | undefined): boolean {
  return OAUTH_PROVIDERS.includes(provider as MailboxProvider);
}

/** settings.email.provider as returned by GET /email/config, or null if it isn't a mailbox. */
export function toMailboxProvider(raw: string | null | undefined): MailboxProvider | null {
  return isOAuthMailboxProvider(raw) ? (raw as MailboxProvider) : null;
}

/**
 * Which provider the advanced ("use your own mail server") panel should send
 * on save.
 *
 * PUT /email/config writes `provider` straight into settings.email.provider,
 * and that single field is what getMailboxConnection() reads to decide whether
 * the practice has a two-way mailbox. Hardcoding 'smtp' there meant a practice
 * on Microsoft 365 who opened the advanced panel and hit Save silently lost
 * Inbox sync, with its OAuth credentials still stored but unused.
 *
 * So: only claim SMTP when the practice has actually given us a mail server to
 * talk to. Otherwise round-trip whatever provider the server reported.
 */
export function resolveEmailSaveProvider(
  currentProvider: string | null | undefined,
  smtpHost: string | null | undefined
): EmailProvider {
  if (smtpHost && smtpHost.trim()) return 'smtp';
  if (currentProvider) return currentProvider as EmailProvider;
  return 'smtp';
}
