import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { getClientByPortalToken } from '../services/proposalSharingService.js';
import { saveAmlDocument } from '../services/fileStorage.js';
import logger from '../config/logger.js';

const router = Router();

const amlFileSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  data: z.string().min(50),
});

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
  photoIdDocument: amlFileSchema,
  proofOfAddressDocument: amlFileSchema,
  confirmAccurate: z.literal(true),
});

function sanitiseSubmissionForClient(existing: Record<string, unknown> | null) {
  if (!existing) return null;
  const { photoIdDocument, proofOfAddressDocument, ...rest } = existing;
  return {
    ...rest,
    photoIdDocument: photoIdDocument
      ? {
          fileName: (photoIdDocument as Record<string, unknown>).fileName,
          mimeType: (photoIdDocument as Record<string, unknown>).mimeType,
          sizeBytes: (photoIdDocument as Record<string, unknown>).sizeBytes,
          uploadedAt: (photoIdDocument as Record<string, unknown>).uploadedAt,
        }
      : null,
    proofOfAddressDocument: proofOfAddressDocument
      ? {
          fileName: (proofOfAddressDocument as Record<string, unknown>).fileName,
          mimeType: (proofOfAddressDocument as Record<string, unknown>).mimeType,
          sizeBytes: (proofOfAddressDocument as Record<string, unknown>).sizeBytes,
          uploadedAt: (proofOfAddressDocument as Record<string, unknown>).uploadedAt,
        }
      : null,
  };
}

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
        existingSubmission: sanitiseSubmissionForClient(existing),
      },
    });
  })
);

/**
 * POST /api/onboarding/aml/:token
 * Submit AML / ID verification details with document uploads
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

    let photoIdMeta;
    let proofOfAddressMeta;
    try {
      photoIdMeta = await saveAmlDocument(
        client.tenantId,
        client.id,
        'photo_id',
        data.photoIdDocument.data,
        data.photoIdDocument.fileName
      );
      proofOfAddressMeta = await saveAmlDocument(
        client.tenantId,
        client.id,
        'proof_of_address',
        data.proofOfAddressDocument.data,
        data.proofOfAddressDocument.fileName
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save uploaded documents';
      throw new ApiError('UPLOAD_FAILED', msg, 400);
    }

    const payload = {
      idDocumentType: data.idDocumentType,
      idDocumentTypeOther: data.idDocumentTypeOther,
      fullLegalName: data.fullLegalName,
      dateOfBirth: data.dateOfBirth,
      registeredAddress: data.registeredAddress,
      nationality: data.nationality,
      sourceOfFunds: data.sourceOfFunds,
      isPep: data.isPep,
      pepDetails: data.pepDetails,
      photoIdDocument: photoIdMeta,
      proofOfAddressDocument: proofOfAddressMeta,
      submittedAt: new Date().toISOString(),
      ipAddress: req.ip,
    };

    const submittedAt = new Date();

    await prisma.client.update({
      where: { id: client.id },
      data: {
        amlSubmissionData: JSON.stringify(payload),
        amlSubmittedAt: submittedAt,
        lifecycleStage:
          client.lifecycleStage === 'PROPOSAL_ACCEPTED' ? 'AML_PENDING' : client.lifecycleStage,
      },
    });

    await prisma.activityLog.create({
      data: {
        tenantId: client.tenantId,
        action: 'CLIENT_AML_SUBMITTED',
        entityType: 'CLIENT',
        entityId: client.id,
        description: `${client.name} submitted AML / ID details via secure form`,
        metadata: JSON.stringify({
          clientId: client.id,
          photoIdFile: photoIdMeta.fileName,
          proofOfAddressFile: proofOfAddressMeta.fileName,
        }),
      },
    });

    logger.info(`AML form submitted for client ${client.id} with document uploads`);

    res.json({
      success: true,
      data: {
        message: 'Thank you — your practice will review your details shortly.',
        amlSubmittedAt: submittedAt.toISOString(),
      },
    });
  })
);

export default router;