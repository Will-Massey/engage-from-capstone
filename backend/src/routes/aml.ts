/**
 * AML partner routes (W3.3)
 * POST /api/aml/check            — initiate AML check (SmartSearch/Creditsafe / demo stub)
 * GET  /api/aml/status/:clientId — staff panel AML status
 * POST /api/aml/webhook          — partner results webhook
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { secureCompare } from '../utils/secureCompare.js';
import { isProduction } from '../utils/securityFlags.js';
import {
  getAmlPartnerConfig,
  getAmlStatusForClient,
  initiateAmlCheck,
  processAmlWebhook,
} from '../services/amlService.js';
import logger from '../config/logger.js';

const router = Router();

const checkSchema = z.object({
  clientId: z.string().uuid(),
  provider: z.enum(['smartsearch', 'creditsafe', 'stub']).optional(),
});

const webhookSchema = z.object({
  providerRef: z.string().min(1),
  status: z.enum(['clear', 'refer', 'failed', 'pending']),
  completedAt: z.string().datetime().optional(),
  details: z.record(z.unknown()).optional(),
});

/**
 * POST /api/aml/check
 */
router.post(
  '/check',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const parsed = checkSchema.parse(req.body ?? {});

    try {
      const result = await initiateAmlCheck({
        tenantId: req.tenantId!,
        clientId: parsed.clientId,
        provider: parsed.provider,
        initiatedByUserId: req.user!.id,
      });

      res.status(202).json({
        success: true,
        data: result,
        message: result.message,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AML check failed';
      if (msg.includes('not found')) {
        throw new ApiError('CLIENT_NOT_FOUND', 'Client not found', 404);
      }
      logger.error('AML check failed', err);
      throw new ApiError('AML_CHECK_FAILED', 'AML check failed', 500);
    }
  })
);

/**
 * GET /api/aml/status/:clientId
 * Staff panel — live/demo mode, provider, last check status.
 */
router.get(
  '/status/:clientId',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    try {
      const status = await getAmlStatusForClient(req.tenantId!, req.params.clientId);
      const config = getAmlPartnerConfig();

      res.json({
        success: true,
        data: {
          ...status,
          config,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load AML status';
      if (msg.includes('not found')) {
        throw new ApiError('CLIENT_NOT_FOUND', 'Client not found', 404);
      }
      logger.error('AML status lookup failed', err);
      throw new ApiError('AML_STATUS_FAILED', 'Failed to load AML status', 500);
    }
  })
);

/**
 * POST /api/aml/webhook
 * Public endpoint — optionally secured via AML_WEBHOOK_SECRET header.
 */
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const secret = process.env.AML_WEBHOOK_SECRET;
    if (!secret) {
      if (isProduction) {
        throw new ApiError('WEBHOOK_NOT_CONFIGURED', 'AML webhook is not configured', 503);
      }
    } else {
      const provided = req.headers['x-aml-webhook-secret'];
      if (!secureCompare(provided, secret)) {
        throw new ApiError('FORBIDDEN', 'Invalid AML webhook secret', 403);
      }
    }

    const payload = webhookSchema.parse(req.body ?? {});

    try {
      const result = await processAmlWebhook({
        providerRef: payload.providerRef,
        status: payload.status,
        completedAt: payload.completedAt,
        details: payload.details,
      });

      if (!result.updated) {
        res.status(404).json({
          success: false,
          error: { code: 'UNKNOWN_REF', message: 'No client matched providerRef' },
        });
        return;
      }

      res.json({
        success: true,
        data: result,
        message: 'AML webhook processed successfully',
      });
    } catch (err) {
      logger.error('AML webhook processing failed', err);
      throw new ApiError('AML_WEBHOOK_FAILED', 'Webhook processing failed', 500);
    }
  })
);

export default router;
