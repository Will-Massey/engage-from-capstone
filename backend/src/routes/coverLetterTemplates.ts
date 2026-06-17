/**
 * Cover Letter Template Routes
 * CRUD operations for cover letter templates
 */

import { Router } from 'express';
import { z } from 'zod';
import { CoverLetterTone } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  renderCoverLetter,
  getDefaultTemplate,
} from '../services/coverLetterTemplateService.js';
import { coverLetterMergeFields } from '../data/defaultCoverLetters.js';

const router = Router();

// Validation schemas
const createTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  tone: z.nativeEnum(CoverLetterTone),
  content: z.string().min(10, 'Content must be at least 10 characters'),
  isDefault: z.boolean().optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  tone: z.nativeEnum(CoverLetterTone).optional(),
  content: z.string().min(10).optional(),
  isDefault: z.boolean().optional(),
});

const previewSchema = z.object({
  clientName: z.string().optional().default('Alex Rivera'),
  companyName: z.string().optional().default('Rivera & Co Ltd'),
  servicesSummary: z.string().optional().default('bookkeeping, VAT compliance and annual accounts'),
  discussionDate: z.string().optional().default('our recent discussion'),
  tenantName: z.string().optional().default('Your Practice'),
  firmExperience: z.string().optional().default('over 20 years'),
  sectorOrRegion: z.string().optional().default('the region'),
  firmCredentials: z.string().optional().default('ICAEW-regulated'),
  keyOutcome: z.string().optional().default('compliant accounts and clear management information'),
  senderName: z.string().optional().default('Jordan Hale'),
  senderPosition: z.string().optional().default('Partner'),
  serviceCount: z.number().optional().default(4),
  monthlyTotal: z.string().optional().default('£712'),
  proposalReference: z.string().optional(),
  proposalTitle: z.string().optional(),
});

/**
 * GET /api/cover-letter-templates
 * Get all templates for tenant
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const templates = await getTemplates(req.tenantId!);

    res.json({
      success: true,
      data: templates,
    });
  })
);

/**
 * GET /api/cover-letter-templates/merge-fields
 * Get available merge fields
 */
router.get(
  '/merge-fields',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: coverLetterMergeFields,
    });
  })
);

/**
 * GET /api/cover-letter-templates/default
 * Get the default template for tenant
 */
router.get(
  '/default',
  authenticate,
  asyncHandler(async (req, res) => {
    const template = await getDefaultTemplate(req.tenantId!);

    if (!template) {
      throw new ApiError('NOT_FOUND', 'No templates found', 404);
    }

    res.json({
      success: true,
      data: template,
    });
  })
);

/**
 * GET /api/cover-letter-templates/:id
 * Get a single template
 */
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const template = await getTemplateById(id, req.tenantId!);

    if (!template) {
      throw new ApiError('NOT_FOUND', 'Template not found', 404);
    }

    res.json({
      success: true,
      data: template,
    });
  })
);

/**
 * POST /api/cover-letter-templates
 * Create a new template
 */
router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const data = createTemplateSchema.parse(req.body) as {
      name: string;
      tone: any;
      content: string;
      isDefault?: boolean;
    };

    const template = await createTemplate(req.tenantId!, data, req.user!.id);

    res.status(201).json({
      success: true,
      data: template,
    });
  })
);

/**
 * PUT /api/cover-letter-templates/:id
 * Update a template
 */
router.put(
  '/:id',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = updateTemplateSchema.parse(req.body);

    // Check template exists
    const existing = await getTemplateById(id, req.tenantId!);
    if (!existing) {
      throw new ApiError('NOT_FOUND', 'Template not found', 404);
    }

    // Prevent editing system templates (optional - can be removed if you want to allow editing)
    if (existing.isSystem && !req.user?.role?.includes('ADMIN')) {
      throw new ApiError('FORBIDDEN', 'System templates can only be edited by admins', 403);
    }

    const template = await updateTemplate(id, req.tenantId!, data);

    res.json({
      success: true,
      data: template,
    });
  })
);

/**
 * DELETE /api/cover-letter-templates/:id
 * Delete a template
 */
router.delete(
  '/:id',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check template exists
    const existing = await getTemplateById(id, req.tenantId!);
    if (!existing) {
      throw new ApiError('NOT_FOUND', 'Template not found', 404);
    }

    // Prevent deleting system templates
    if (existing.isSystem) {
      throw new ApiError('FORBIDDEN', 'System templates cannot be deleted', 403);
    }

    await deleteTemplate(id, req.tenantId!);

    res.json({
      success: true,
      message: 'Template deleted successfully',
    });
  })
);

/**
 * POST /api/cover-letter-templates/:id/preview
 * Preview a template with merge fields
 */
router.post(
  '/:id/preview',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const previewData = previewSchema.parse(req.body) as {
      clientName: string;
      tenantName: string;
      serviceCount: number;
      monthlyTotal: string;
      senderName: string;
      senderPosition?: string;
      proposalReference?: string;
      proposalTitle?: string;
    };

    const template = await getTemplateById(id, req.tenantId!);

    if (!template) {
      throw new ApiError('NOT_FOUND', 'Template not found', 404);
    }

    const rendered = renderCoverLetter(template.content, previewData);

    res.json({
      success: true,
      data: {
        original: template.content,
        rendered,
      },
    });
  })
);

/**
 * POST /api/cover-letter-templates/preview
 * Preview raw content with merge fields (without saving)
 */
router.post(
  '/preview',
  authenticate,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      content: z.string().min(1, 'Content is required'),
      previewData: previewSchema,
    });

    const { content, previewData } = schema.parse(req.body);
    const typedPreviewData = previewData as {
      clientName: string;
      tenantName: string;
      serviceCount: number;
      monthlyTotal: string;
      senderName: string;
      senderPosition?: string;
      proposalReference?: string;
      proposalTitle?: string;
    };

    const rendered = renderCoverLetter(content, typedPreviewData);

    res.json({
      success: true,
      data: {
        original: content,
        rendered,
      },
    });
  })
);

export default router;
