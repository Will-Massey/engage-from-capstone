import { Request, Response } from 'express';
import { prisma } from '../config/database.js';
import { EmailService } from '../services/emailService.js';
import { encrypt } from '../utils/encryption.js';
import { verifyOAuthState } from '../utils/oauthState.js';
import logger from '../utils/logger.js';
import { getApiUrl, getFrontendUrl } from '../config/urls.js';

const frontendUrl = () => getFrontendUrl();

const apiBaseUrl = () =>
  process.env.NODE_ENV === 'production'
    ? getApiUrl()
    : process.env.API_URL ||
      process.env.BACKEND_URL ||
      `http://localhost:${process.env.PORT || 3001}`;

const VALID_PROVIDERS = ['microsoft365', 'outlook', 'gmail'] as const;

/**
 * `fallbackEmail` is deliberately NOT used as the mailbox address. It is the
 * logged-in Engage user, which is a different thing from the mailbox they just
 * authorised, and storing it makes `isCustomEmailConfigured` true with an
 * address that may not exist in the mail tenant — which routes every tenant
 * email through SMTP auth that then fails. Leaving the address unset keeps
 * tenant email on the working platform path; the Graph/Gmail sync never needs
 * it. Exported for tests.
 */
export async function saveOAuthTokens(
  tenantId: string,
  provider: string,
  tokens: { refreshToken: string; accessToken: string; user?: string },
  _fallbackEmail?: string
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  const settings = JSON.parse(tenant.settings || '{}');
  if (!settings.email) {
    settings.email = {};
  }

  settings.email.provider = provider;
  settings.email[provider === 'microsoft365' ? 'outlook' : provider] = {
    clientId: provider === 'gmail' ? process.env.GMAIL_CLIENT_ID : process.env.MICROSOFT_CLIENT_ID,
    clientSecret: encrypt(
      provider === 'gmail'
        ? process.env.GMAIL_CLIENT_SECRET || ''
        : process.env.MICROSOFT_CLIENT_SECRET || ''
    ),
    refreshToken: encrypt(tokens.refreshToken),
    user: tokens.user,
  };

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: JSON.stringify(settings) },
  });
}

/**
 * Land the mailbox OAuth round-trip back on whichever page started it — the
 * Settings > Communications tab, or /integrations, now the primary place to
 * connect a mailbox. `returnTo` comes from the signed OAuth state, so it is
 * never user-controlled at this point; it defaults to the original Settings
 * destination when absent, which is what the frozen mobile snapshot (no
 * `returnTo` concept, one `communications` tab rendering `<EmailSettings />`)
 * still gets. `provider` is always included so the widget can tell its own
 * callback apart from Xero's or QuickBooks', which share these query params.
 */
const mailboxRedirect = (params: Record<string, string>, returnTo?: string) => {
  if (returnTo === 'integrations') {
    const qs = new URLSearchParams(params);
    return `${frontendUrl()}/integrations?${qs.toString()}`;
  }
  const qs = new URLSearchParams({ tab: 'communications', ...params });
  return `${frontendUrl()}/settings?${qs.toString()}`;
};

export async function handleOAuthProviderCallback(
  req: Request,
  res: Response,
  provider: string
): Promise<void> {
  const { code, error, state } = req.query;
  // Verified as early as possible so every error branch below can still send
  // the user back where they started, not just the success path.
  const payload = state ? verifyOAuthState(String(state)) : null;
  const redirect = (params: Record<string, string>) => mailboxRedirect(params, payload?.returnTo);

  if (!VALID_PROVIDERS.includes(provider as (typeof VALID_PROVIDERS)[number])) {
    res.redirect(redirect({ error: 'invalid_provider' }));
    return;
  }

  if (error) {
    res.redirect(redirect({ provider, error: String(error) }));
    return;
  }

  if (!code || !state) {
    res.redirect(redirect({ provider, error: 'no_code_received' }));
    return;
  }

  if (!payload || payload.provider !== provider) {
    res.redirect(redirect({ provider, error: 'invalid_state' }));
    return;
  }

  const redirectUri = `${apiBaseUrl()}/api/oauth/callback/${provider}`;

  try {
    let tokens: { refreshToken: string; accessToken: string; user?: string };

    if (provider === 'gmail') {
      const clientId = process.env.GMAIL_CLIENT_ID!;
      const clientSecret = process.env.GMAIL_CLIENT_SECRET!;
      tokens = await EmailService.exchangeGmailCode(
        clientId,
        clientSecret,
        redirectUri,
        String(code)
      );
    } else {
      const clientId = process.env.MICROSOFT_CLIENT_ID!;
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET!;
      tokens = await EmailService.exchangeMicrosoftCode(
        clientId,
        clientSecret,
        redirectUri,
        String(code),
        'common'
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { email: true },
    });

    await saveOAuthTokens(payload.tenantId, provider, tokens, user?.email);

    res.redirect(redirect({ oauth: 'success', provider }));
  } catch (err: any) {
    logger.error('OAuth callback exchange failed:', err);
    res.redirect(redirect({ provider, error: 'oauth_failed' }));
  }
}
