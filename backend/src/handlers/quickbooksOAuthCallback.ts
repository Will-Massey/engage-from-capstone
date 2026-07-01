import { Request, Response } from 'express';
import { verifyOAuthState } from '../utils/oauthState.js';
import { completeQuickBooksOAuth } from '../services/quickbooksService.js';
import { isQuickBooksOAuthConfigured } from '../services/tenantQuickbooksSettings.js';
import logger from '../config/logger.js';

const frontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:5173';

const settingsRedirect = (params: Record<string, string>) => {
  const qs = new URLSearchParams({ tab: 'integrations', ...params });
  return `${frontendUrl()}/settings?${qs.toString()}`;
};

export async function handleQuickBooksOAuthCallback(req: Request, res: Response): Promise<void> {
  const { code, error, state, realmId } = req.query;

  if (error) {
    res.redirect(settingsRedirect({ oauth: 'error', provider: 'quickbooks', error: String(error) }));
    return;
  }

  if (!code || !state) {
    res.redirect(settingsRedirect({ oauth: 'error', provider: 'quickbooks', error: 'no_code_received' }));
    return;
  }

  if (!isQuickBooksOAuthConfigured()) {
    res.redirect(
      settingsRedirect({ oauth: 'error', provider: 'quickbooks', error: 'not_configured' })
    );
    return;
  }

  const payload = verifyOAuthState(String(state));
  if (!payload || payload.provider !== 'quickbooks') {
    res.redirect(settingsRedirect({ oauth: 'error', provider: 'quickbooks', error: 'invalid_state' }));
    return;
  }

  try {
    await completeQuickBooksOAuth({
      tenantId: payload.tenantId,
      userId: payload.userId,
      code: String(code),
      realmId: realmId ? String(realmId) : undefined,
    });

    res.redirect(settingsRedirect({ oauth: 'success', provider: 'quickbooks' }));
  } catch (err) {
    logger.error('QuickBooks OAuth callback failed', err);
    res.redirect(settingsRedirect({ oauth: 'error', provider: 'quickbooks', error: 'token_exchange_failed' }));
  }
}