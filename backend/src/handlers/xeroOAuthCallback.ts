import { Request, Response } from 'express';
import { verifyOAuthState } from '../utils/oauthState.js';
import { exchangeXeroCallbackUrl } from '../services/xeroService.js';
import { saveTenantXeroSettings } from '../services/tenantXeroSettings.js';
import logger from '../config/logger.js';
import { getFrontendUrl } from '../config/urls.js';

const frontendUrl = () => getFrontendUrl();

const settingsRedirect = (params: Record<string, string>) => {
  const qs = new URLSearchParams({ tab: 'integrations', ...params });
  return `${frontendUrl()}/settings?${qs.toString()}`;
};

export async function handleXeroOAuthCallback(req: Request, res: Response): Promise<void> {
  const { code, error, state } = req.query;

  if (error) {
    res.redirect(settingsRedirect({ error: String(error) }));
    return;
  }

  if (!code || !state) {
    res.redirect(settingsRedirect({ error: 'no_code_received' }));
    return;
  }

  const payload = verifyOAuthState(String(state));
  if (!payload || payload.provider !== 'xero') {
    res.redirect(settingsRedirect({ error: 'invalid_state' }));
    return;
  }

  try {
    const callbackPath = req.originalUrl || req.url;
    const { tokenSet, tenants } = await exchangeXeroCallbackUrl(callbackPath);

    if (!tenants.length) {
      res.redirect(settingsRedirect({ error: 'no_xero_organisation' }));
      return;
    }

    const org = tenants[0];
    const tokenObj = tokenSet as Record<string, unknown>;

    await saveTenantXeroSettings(payload.tenantId, {
      connected: true,
      xeroTenantId: org.tenantId,
      xeroTenantName: org.tenantName,
      refreshToken: String(tokenObj.refresh_token || ''),
      accessToken: tokenObj.access_token ? String(tokenObj.access_token) : undefined,
      idToken: tokenObj.id_token ? String(tokenObj.id_token) : undefined,
      tokenExpiresAt: tokenObj.expires_at
        ? new Date(Number(tokenObj.expires_at) * 1000).toISOString()
        : tokenObj.expires_in
          ? new Date(Date.now() + Number(tokenObj.expires_in) * 1000).toISOString()
          : undefined,
      scope: tokenObj.scope
        ? String(tokenObj.scope).split(/[\s,]+/).filter(Boolean)
        : undefined,
      connectedAt: new Date().toISOString(),
      connectedByUserId: payload.userId,
    });

    res.redirect(settingsRedirect({ oauth: 'success', provider: 'xero' }));
  } catch (err: unknown) {
    logger.error('Xero OAuth callback exchange failed:', err);
    res.redirect(settingsRedirect({ error: 'oauth_failed' }));
  }
}