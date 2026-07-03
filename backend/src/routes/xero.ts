/**
 * Xero Integration Routes (Phase W1.1–W1.2)
 *
 * OAuth2 connect/disconnect/callback — tokens encrypted on Tenant.settings.xero
 * GET  /status              — connection status
 * GET  /connect             — OAuth consent URL
 * POST /disconnect          — revoke + clear tokens
 * POST /import-clients      — pull Xero contacts → Engage clients (dedupe email/name)
 * POST /push-accepted/:id   — accepted proposal → Xero (legacy alias)
 * POST /push-proposal/:id   — accepted proposal → Xero contact + repeating invoices
 */

import { Router } from 'express';
import { z } from 'zod';
import { CompanyType } from '@prisma/client';
import { prisma } from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { createOAuthState } from '../utils/oauthState.js';
import {
  getTenantXeroSettings,
  saveTenantXeroSettings,
  clearTenantXeroSettings,
  xeroStatusFromSettings,
  isXeroOAuthConfigured,
} from '../services/tenantXeroSettings.js';
import {
  buildXeroConsentUrl,
  fetchAllXeroContacts,
  getAuthenticatedXeroSession,
  normalizeClientName,
  revokeXeroConnection,
  getXeroPublicConfig,
} from '../services/xeroService.js';
import { pushProposalToXero } from '../services/xeroProposalPush.js';
import logger from '../config/logger.js';

const router = Router();

function ensureXeroConfigured() {
  if (!isXeroOAuthConfigured()) {
    throw new ApiError(
      'XERO_NOT_CONFIGURED',
      'Xero OAuth is not configured on the server. Set XERO_CLIENT_ID, XERO_CLIENT_SECRET, and XERO_REDIRECT_URI.',
      503
    );
  }
}

async function handlePushProposal(tenantId: string, proposalId: string) {

  try {
    const result = await pushProposalToXero(tenantId, proposalId);

    const message =
      result.mode === 'live'
        ? result.xero.repeatingInvoice.created > 0
          ? `Proposal pushed to Xero — ${result.xero.repeatingInvoice.created} repeating invoice(s) created`
          : 'Proposal pushed to Xero with warnings — check response details'
        : 'Xero stub mode — draft payloads returned (connect Xero for live sync)';

    return {
      success: true,
      data: {
        proposalId,
        reference: result.reference,
        mode: result.mode,
        xero: result.xero,
        warnings: result.warnings,
      },
      message,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Xero push failed';
    if (msg.includes('not found')) {
      throw new ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
    }
    if (msg.includes('Only accepted')) {
      throw new ApiError(
        'PROPOSAL_NOT_ACCEPTED',
        'Only accepted proposals can be pushed to Xero',
        400
      );
    }
    logger.error('Xero push-proposal failed', err);
    throw new ApiError('XERO_PUSH_FAILED', msg, 502);
  }
}

/**
 * GET /api/xero/status
 */
router.get(
  '/status',
  authenticate,
  asyncHandler(async (req, res) => {
    const raw = await getTenantXeroSettings(req.tenantId!);
    const status = xeroStatusFromSettings(
      raw
        ? {
            ...raw,
            connected: true,
          }
        : null
    );

    res.json({
      success: true,
      data: {
        ...status,
        ...getXeroPublicConfig(),
      },
    });
  })
);

/**
 * GET /api/xero/connect — start OAuth2 flow
 */
router.get(
  '/connect',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    ensureXeroConfigured();

    const tenantId = req.tenantId!;
    const userId = req.user!.id;

    const state = createOAuthState({ tenantId, userId, provider: 'xero' });
    const url = await buildXeroConsentUrl(state);

    res.json({
      success: true,
      data: { url, state },
    });
  })
);

/**
 * POST /api/xero/disconnect
 */
router.post(
  '/disconnect',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;

    try {
      await revokeXeroConnection(tenantId);
    } catch (err) {
      logger.warn('Xero disconnect: revoke skipped', err);
    }

    await clearTenantXeroSettings(tenantId);

    res.json({
      success: true,
      message: 'Xero disconnected successfully',
    });
  })
);

/**
 * POST /api/xero/import-clients
 */
router.post(
  '/import-clients',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;

    const { dryRun } = z
      .object({
        dryRun: z.boolean().optional().default(false),
      })
      .parse(req.body ?? {});

    const session = await getAuthenticatedXeroSession(tenantId);
    const xeroContacts = await fetchAllXeroContacts(session);

    const existing = await prisma.client.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, contactEmail: true, tags: true },
    });

    const byEmail = new Map<string, (typeof existing)[0]>();
    const byName = new Map<string, (typeof existing)[0]>();

    for (const c of existing) {
      if (c.contactEmail) {
        byEmail.set(c.contactEmail.toLowerCase().trim(), c);
      }
      byName.set(normalizeClientName(c.name), c);
    }

    const created: Array<{ name: string; contactEmail: string; xeroContactId?: string }> = [];
    const skipped: Array<{ name: string; reason: string; existingClientId?: string }> = [];
    const errors: Array<{ name: string; error: string }> = [];

    for (const xc of xeroContacts) {
      const name = (xc.name || '').trim();
      const email = (xc.emailAddress || '').trim().toLowerCase();
      const xeroContactId = xc.contactID;

      if (!name && !email) {
        skipped.push({ name: '(blank)', reason: 'missing_name_and_email' });
        continue;
      }

      if (email && byEmail.has(email)) {
        skipped.push({
          name: name || email,
          reason: 'duplicate_email',
          existingClientId: byEmail.get(email)!.id,
        });
        continue;
      }

      if (name && byName.has(normalizeClientName(name))) {
        skipped.push({
          name,
          reason: 'duplicate_name',
          existingClientId: byName.get(normalizeClientName(name))!.id,
        });
        continue;
      }

      if (dryRun) {
        created.push({ name: name || email, contactEmail: email || `${xeroContactId}@import.local` });
        continue;
      }

      try {
        const client = await prisma.client.create({
          data: {
            tenantId,
            name: name || email,
            contactEmail: email || `xero-${xeroContactId}@engage-import.local`,
            contactName: name,
            companyType: CompanyType.LIMITED_COMPANY,
            notes: `Imported from Xero (contact ${xeroContactId})`,
            tags: xeroContactId ? `xero:${xeroContactId}` : 'xero-import',
            vatRegistered: false,
          },
        });

        created.push({
          name: client.name,
          contactEmail: client.contactEmail,
          xeroContactId,
        });

        if (email) byEmail.set(email, client);
        byName.set(normalizeClientName(client.name), client);
      } catch (err: unknown) {
        errors.push({
          name: name || email,
          error: err instanceof Error ? err.message : 'create_failed',
        });
      }
    }

    if (!dryRun) {
      const settings = await getTenantXeroSettings(tenantId);
      if (settings) {
        await saveTenantXeroSettings(tenantId, {
          ...settings,
          lastImportAt: new Date().toISOString(),
        });
      }
    }

    res.json({
      success: true,
      data: {
        dryRun,
        xeroContactsFetched: xeroContacts.length,
        created: created.length,
        skipped: skipped.length,
        errors: errors.length,
        createdClients: created,
        skippedContacts: skipped.slice(0, 100),
        importErrors: errors,
      },
      message: dryRun
        ? `Dry run: would create ${created.length} clients from ${xeroContacts.length} Xero contacts`
        : `Imported ${created.length} clients from Xero (${skipped.length} skipped)`,
    });
  })
);

/**
 * POST /api/xero/push-proposal/:proposalId
 * POST /api/xero/push-accepted/:proposalId (legacy alias)
 */
router.post(
  '/push-proposal/:proposalId',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const payload = await handlePushProposal(req.tenantId!, req.params.proposalId);
    res.json(payload);
  })
);

router.post(
  '/push-accepted/:proposalId',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const payload = await handlePushProposal(req.tenantId!, req.params.proposalId);
    res.json(payload);
  })
);

export default router;