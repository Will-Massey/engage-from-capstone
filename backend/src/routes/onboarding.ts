import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { getClientByPortalToken } from '../services/proposalSharingService.js';
import logger from '../config/logger.js';

const router = Router();

const amlSubmissionSchema = z.object({
  idDocumentType: z.enum(['PASSPORT', 'DRIVING_LICENCE', 'OTHER']),
  idDocumentTypeOther: z.string().optional(),
  fullLegalName: z.string().min(2).max(200),
  dateOfBirth: z.string().min(8).max(20),
  registeredAddress: z.string().min(5).max(500),
  nationality: z.string().min(2).max(100),
  sourceOfFunds: z.string().min(3).max(1000),
  isPep: z.boolean(),
  pepDetails: z.string().max(1000).optional(),
  confirmAccurate: z.literal(true),
});

/**
 * GET /api/onboarding/aml/:token
 * Public AML checklist form context (uses client portal token)
 */
router.get(
  '/aml/:token',
  asyncHandler(async (req, res) => {
    const client = await getClientByPortalToken(req.params.token);
    if (!client) {
      throw new ApiError('NOT_FOUND', 'Link not found or expired', 404);
    }

    let existing: Record<string, unknown> | null = null;
    if (client.amlSubmissionData) {
      try {
        existing = JSON.parse(client.amlSubmissionData);
      } catch {
        existing = null;
      }
    }

    res.json({
      success: true,
      data: {
        client: {
          name: client.name,
          contactName: client.contactName,
        },
        practice: {
          name: client.tenant.name,
          primaryColor: client.tenant.primaryColor,
          logo: client.tenant.logo,
        },
        lifecycleStage: client.lifecycleStage,
        amlSubmittedAt: client.amlSubmittedAt,
        amlCompletedAt: client.amlCompletedAt,
        existingSubmission: existing,
      },
    });
  })
);

/**
 * POST /api/onboarding/aml/:token
 * Submit AML / ID verification details
 */
router.post(
  '/aml/:token',
  asyncHandler(async (req, res) => {
    const client = await getClientByPortalToken(req.params.token);
    if (!client) {
      throw new ApiError('NOT_FOUND', 'Link not found or expired', 404);
    }

    if (client.amlCompletedAt) {
      throw new ApiError('ALREADY_COMPLETE', 'AML verification is already complete', 400);
    }

    const data = amlSubmissionSchema.parse(req.body);

    if (data.isPep && !data.pepDetails?.trim()) {
      throw new ApiError('VALIDATION_ERROR', 'Please provide PEP details', 400);
    }

    const payload = {
      ...data,
      submittedAt: new Date().toISOString(),
      ipAddress: req.ip,
    };

    await prisma.client.update({
      where: { id: client.id },
      data: {
        amlSubmissionData: JSON.stringify(payload),
        amlSubmittedAt: new Date(),
      },
    });

    await prisma.activityLog.create({
      data: {
        tenantId: client.tenantId,
        action: 'CLIENT_AML_SUBMITTED',
        entityType: 'CLIENT',
        entityId: client.id,
        description: `${client.name} submitted AML / ID details via secure form`,
        metadata: JSON.stringify({ clientId: client.id }),
      },
    });

    logger.info(`AML form submitted for client ${client.id}`);

    res.json({
      success: true,
      data: { message: 'Thank you — your practice will review your details shortly.' },
    });
  })
);

export default router;
