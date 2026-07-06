/**
 * QuickBooks Integration Routes (W4.7 scaffold)
 * GET  /status   — connection status
 * GET  /connect  — OAuth consent URL
 * GET  /callback — OAuth redirect (also mounted at /api/oauth/callback/quickbooks)
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { createOAuthState } from '../utils/oauthState.js';
import {
  getTenantQuickBooksSettings,
  clearTenantQuickBooksSettings,
  quickbooksStatusFromSettings,
  isQuickBooksOAuthConfigured,
  getQuickBooksPublicConfig,
} from '../services/tenantQuickbooksSettings.js';
import {
  buildQuickBooksConsentUrl,
  revokeQuickBooksConnection,
} from '../services/quickbooksService.js';

const router = Router();

function ensureQuickBooksConfigured() {
  if (!isQuickBooksOAuthConfigured()) {
    throw new ApiError(
      'QUICKBOOKS_NOT_CONFIGURED',
      'QuickBooks OAuth is not configured on the server. Set QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, and QUICKBOOKS_REDIRECT_URI.',
      503
    );
  }
}

router.get(
  '/status',
  authenticate,
  asyncHandler(async (req, res) => {
    const raw = await getTenantQuickBooksSettings(req.tenantId!);
    const status = quickbooksStatusFromSettings(raw);

    res.json({
      success: true,
      data: {
        ...status,
        ...getQuickBooksPublicConfig(),
        scaffold: true,
        note: 'Client sync and proposal push are stubbed until full W4.7 implementation.',
      },
    });
  })
);

router.get(
  '/connect',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    ensureQuickBooksConfigured();

    const state = createOAuthState({
      tenantId: req.tenantId!,
      userId: req.user!.id,
      provider: 'quickbooks',
    });
    const url = buildQuickBooksConsentUrl(state);

    res.json({
      success: true,
      data: { url, state },
    });
  })
);

router.post(
  '/disconnect',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    try {
      await revokeQuickBooksConnection(tenantId);
    } catch {
      // non-blocking
    }
    await clearTenantQuickBooksSettings(tenantId);

    res.json({
      success: true,
      message: 'QuickBooks disconnected successfully',
    });
  })
);

export default router;
