/**
 * AML partner routes (W3.3)
 * POST /api/aml/check            — initiate AML check (SmartSearch/Creditsafe / demo stub)
 * GET  /api/aml/status/:clientId — staff panel AML status
 * GET  /api/aml/usage            — provider-backed checks this month (R2.4 metering)
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
import { getAmlUsage } from '../services/aml/amlUsageService.js';
import { prisma } from '../config/database.js';
import { readAmlDocument } from '../services/fileStorage.js';
import { resolveAmlDocumentPath, type AmlDocumentType } from '../services/aml/amlDocuments.js';
import logger from '../config/logger.js';

const router = Router();

const AML_DOCUMENT_TYPES = new Set<AmlDocumentType>(['photo_id', 'proof_of_address']);

/** ASCII-safe filename for Content-Disposition (non-Latin-1 chars 500 the header). */
function asciiFilename(name: string, fallback: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/["\\]/g, '')
    .trim();
  return cleaned || fallback;
}

const checkSchema = z.object({
  clientId: z.string().uuid(),
  provider: z.enum(['smartsearch', 'creditsafe', 'stub']).optional(),
});

const usageQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
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
 * GET /api/aml/documents/:clientId/:type
 * Stream a client-uploaded AML document (photo_id | proof_of_address) for staff
 * review. Tenant-scoped, role-gated; the storage path is resolved server-side
 * from Client.amlSubmissionData (never user input). Each view is audit-logged.
 */
router.get(
  '/documents/:clientId/:type',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { clientId, type } = req.params;

    if (!AML_DOCUMENT_TYPES.has(type as AmlDocumentType)) {
      throw new ApiError('INVALID_DOCUMENT_TYPE', 'Unknown AML document type', 400);
    }

    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId: req.tenantId! },
      select: { id: true, amlSubmissionData: true },
    });
    if (!client) {
      throw new ApiError('CLIENT_NOT_FOUND', 'Client not found', 404);
    }

    const doc = resolveAmlDocumentPath(client.amlSubmissionData, type as AmlDocumentType);
    if (!doc) {
      throw new ApiError('DOCUMENT_NOT_FOUND', 'No such AML document for this client', 404);
    }

    let bytes: Buffer;
    try {
      bytes = await readAmlDocument(doc.relativePath);
    } catch (err) {
      logger.error('AML document read failed', err);
      throw new ApiError('DOCUMENT_READ_FAILED', 'Could not read the stored document', 502);
    }

    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'CLIENT_AML_DOCUMENT_VIEWED',
        entityType: 'CLIENT',
        entityId: client.id,
        description: `Viewed AML ${type === 'photo_id' ? 'photo ID' : 'proof of address'} document`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${asciiFilename(doc.fileName, `${type}.pdf`)}"`
    );
    res.send(bytes);
  })
);

/**
 * GET /api/aml/usage?month=YYYY-MM
 * Provider-backed AML checks this month (stub checks excluded) plus billing config.
 */
router.get(
  '/usage',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { month } = usageQuerySchema.parse(req.query ?? {});

    try {
      const usage = await getAmlUsage(req.tenantId!, month);
      res.json({
        success: true,
        data: usage,
      });
    } catch (err) {
      logger.error('AML usage lookup failed', err);
      throw new ApiError('AML_USAGE_FAILED', 'Failed to load AML usage', 500);
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
