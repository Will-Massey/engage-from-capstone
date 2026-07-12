/**
 * QuickBooks Integration Routes (R4.1)
 * GET  /status                     — connection status
 * GET  /connect                    — OAuth consent URL
 * POST /disconnect                 — revoke + clear tokens
 * POST /import-clients             — pull QBO customers → Engage clients (dedupe email/name)
 * POST /push-proposal/:proposalId  — accepted proposal → QBO invoice (idempotent, ?force=true)
 * POST /settings                   — sync preferences (payment account)
 * OAuth redirect is mounted at /api/oauth/callback/quickbooks (+ /api/quickbooks/callback).
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { createOAuthState } from '../utils/oauthState.js';
import {
  getTenantQuickBooksSettings,
  saveTenantQuickBooksSettings,
  clearTenantQuickBooksSettings,
  quickbooksStatusFromSettings,
  isQuickBooksOAuthConfigured,
  getQuickBooksPublicConfig,
} from '../services/tenantQuickbooksSettings.js';
import {
  buildQuickBooksConsentUrl,
  revokeQuickBooksConnection,
} from '../services/quickbooksService.js';
import { importQuickBooksClients } from '../services/quickbooksClientImport.js';
import { pushProposalToQuickBooks } from '../services/quickbooksProposalPush.js';
import logger from '../config/logger.js';

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

/**
 * POST /api/quickbooks/import-clients
 */
router.post(
  '/import-clients',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { dryRun } = z
      .object({
        dryRun: z.boolean().optional().default(false),
      })
      .parse(req.body ?? {});

    const result = await importQuickBooksClients(req.tenantId!, dryRun);

    res.json({
      success: true,
      data: result,
      message: dryRun
        ? `Dry run: would create ${result.created} clients from ${result.qboCustomersFetched} QuickBooks customers`
        : `Imported ${result.created} clients from QuickBooks (${result.skipped} skipped)`,
    });
  })
);

/**
 * POST /api/quickbooks/push-proposal/:proposalId (?force=true to re-push)
 */
router.post(
  '/push-proposal/:proposalId',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const force = req.query.force === 'true';

    try {
      const result = await pushProposalToQuickBooks(req.tenantId!, req.params.proposalId, {
        force,
      });

      res.json({
        success: true,
        data: result,
        message: result.skipped
          ? 'Proposal was already pushed to QuickBooks — skipped (pass ?force=true to re-push)'
          : `Proposal pushed to QuickBooks — invoice ${result.invoiceId} created`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'QuickBooks push failed';
      if (msg.includes('not found')) {
        throw new ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
      }
      if (msg.includes('Only accepted')) {
        throw new ApiError(
          'PROPOSAL_NOT_ACCEPTED',
          'Only accepted proposals can be pushed to QuickBooks',
          400
        );
      }
      if (msg.includes('not connected')) {
        throw new ApiError(
          'QUICKBOOKS_NOT_CONNECTED',
          'QuickBooks is not connected for this practice',
          400
        );
      }
      logger.error('QuickBooks push-proposal failed', err);
      throw new ApiError('QUICKBOOKS_PUSH_FAILED', msg, 502);
    }
  })
);

/**
 * POST /api/quickbooks/settings — sync preferences (payment account)
 */
router.post(
  '/settings',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        paymentAccountId: z.string().trim().max(40).nullable().optional(),
      })
      .parse(req.body ?? {});

    const tenantId = req.tenantId!;
    const settings = await getTenantQuickBooksSettings(tenantId);
    if (!settings?.connected) {
      throw new ApiError(
        'QUICKBOOKS_NOT_CONNECTED',
        'QuickBooks is not connected for this practice',
        400
      );
    }

    await saveTenantQuickBooksSettings(tenantId, {
      ...settings,
      ...(body.paymentAccountId !== undefined
        ? { paymentAccountId: body.paymentAccountId || undefined }
        : {}),
    });

    const updated = await getTenantQuickBooksSettings(tenantId);
    res.json({
      success: true,
      data: quickbooksStatusFromSettings(updated),
      message: 'QuickBooks sync settings updated',
    });
  })
);

export default router;
