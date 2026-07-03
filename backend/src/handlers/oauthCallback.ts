import { Request, Response } from 'express';
import { prisma } from '../config/database.js';
import { EmailService } from '../services/emailService.js';
import { encrypt } from '../utils/encryption.js';
import { verifyOAuthState } from '../utils/oauthState.js';
import logger from '../utils/logger.js';
import { getApiUrl, getFrontendUrl } from '../config/urls.js';

const frontendUrl = () => getFrontendUrl();

const apiBaseUrl = () =>
  process.env.NODE_ENV === 'production' ? getApiUrl() : process.env.API_URL || process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;

const VALID_PROVIDERS = ['microsoft365', 'outlook', 'gmail'] as const;

async function saveOAuthTokens(
  tenantId: string,
  provider: string,
  tokens: { refreshToken: string; accessToken: string; user?: string },
  fallbackEmail?: string
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
    user: tokens.user || fallbackEmail,
  };

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: JSON.stringify(settings) },
  });
}

export async function handleOAuthProviderCallback(
  req: Request,
  res: Response,
  provider: string
): Promise<void> {
  if (!VALID_PROVIDERS.includes(provider as (typeof VALID_PROVIDERS)[number])) {
    res.redirect(`${frontendUrl()}/settings?error=invalid_provider`);
    return;
  }

  const { code, error, state } = req.query;

  if (error) {
    res.redirect(
      `${frontendUrl()}/settings?error=${encodeURIComponent(String(error))}`
    );
    return;
  }

  if (!code || !state) {
    res.redirect(`${frontendUrl()}/settings?error=no_code_received`);
    return;
  }

  const payload = verifyOAuthState(String(state));
  if (!payload || payload.provider !== provider) {
    res.redirect(`${frontendUrl()}/settings?error=invalid_state`);
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

    res.redirect(`${frontendUrl()}/settings?oauth=success&provider=${provider}`);
  } catch (err: any) {
    logger.error('OAuth callback exchange failed:', err);
    res.redirect(`${frontendUrl()}/settings?error=oauth_failed`);
  }
}
