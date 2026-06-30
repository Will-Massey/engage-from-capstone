/**
 * Proposal templates — save and reuse proposal configurations per tenant
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { deepCloneJson } from '../utils/proposalServiceSnapshot.js';

const router = Router();

const serviceConfigItemSchema = z.object({
  serviceId: z.string().uuid(),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  billingFrequency: z.string(),
  displayPrice: z.number().min(0),
  quantity: z.number().min(0.01).default(1),
  discountPercent: z.number().min(0).max(100).default(0),
});

const createFromProposalSchema = z.object({
  proposalId: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  title: z.string().min(1),
  coverLetter: z.string().optional(),
  coverLetterTone: z.string().optional(),
  serviceConfig: z.array(serviceConfigItemSchema).min(1),
  targetEntityType: z.string().optional(),
});

function parseServiceConfig(raw: string) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? deepCloneJson(parsed) : [];
  } catch {
    return [];
  }
}

function parseDefaultPricing(raw: string) {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

/** GET /api/proposal-templates */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const templates = await prisma.proposalTemplate.findMany({
      where: { tenantId: req.tenantId!, isActive: true },
      orderBy: [{ lastUsedAt: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        name: true,
        description: true,
        title: true,
        targetEntityType: true,
        usageCount: true,
        lastUsedAt: true,
        updatedAt: true,
        serviceConfig: true,
        defaultPricing: true,
      },
    });

    res.json({
      success: true,
      data: templates.map((t) => ({
        ...t,
        serviceCount: parseServiceConfig(t.serviceConfig).length,
        coverLetterTone: parseDefaultPricing(t.defaultPricing).coverLetterTone,
      })),
    });
  })
);

/** GET /api/proposal-templates/:id */
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const template = await prisma.proposalTemplate.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId!, isActive: true },
    });
    if (!template) throw new ApiError('NOT_FOUND', 'Template not found', 404);

    res.json({
      success: true,
      data: {
        ...template,
        serviceConfig: parseServiceConfig(template.serviceConfig),
        defaultPricing: parseDefaultPricing(template.defaultPricing),
      },
    });
  })
);

/** POST /api/proposal-templates/from-proposal */
router.post(
  '/from-proposal',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const { proposalId, name, description } = createFromProposalSchema.parse(req.body);

    const proposal = await prisma.proposal.findFirst({
      where: { id: proposalId, tenantId: req.tenantId! },
      include: { services: true, client: true },
    });
    if (!proposal) throw new ApiError('NOT_FOUND', 'Proposal not found', 404);

    const serviceConfig = deepCloneJson(
      proposal.services
        .filter((s) => s.serviceTemplateId)
        .map((s) => ({
          serviceId: s.serviceTemplateId!,
          name: s.name,
          description: s.description ?? null,
          billingFrequency: s.billingFrequency,
          displayPrice: s.displayPrice,
          quantity: s.quantity,
          discountPercent: s.discountPercent,
        }))
    );

    if (!serviceConfig.length) {
      throw new ApiError('VALIDATION_ERROR', 'Proposal has no catalogue services to save as a template', 400);
    }

    const template = await prisma.proposalTemplate.create({
      data: {
        tenantId: req.tenantId!,
        createdById: req.user!.id,
        name,
        description,
        title: proposal.title,
        coverLetter: proposal.coverLetter,
        terms: proposal.terms,
        targetEntityType: proposal.client.companyType,
        serviceConfig: JSON.stringify(serviceConfig),
        defaultPricing: JSON.stringify({ coverLetterTone: 'PROFESSIONAL' }),
        usageCount: 0,
      },
    });

    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'PROPOSAL_TEMPLATE_CREATED',
        entityType: 'PROPOSAL_TEMPLATE',
        entityId: template.id,
        description: `Saved proposal template "${name}" from ${proposal.reference}`,
      },
    });

    res.status(201).json({ success: true, data: template });
  })
);

/** POST /api/proposal-templates */
router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const data = createTemplateSchema.parse(req.body);

    const template = await prisma.proposalTemplate.create({
      data: {
        tenantId: req.tenantId!,
        createdById: req.user!.id,
        name: data.name,
        description: data.description,
        title: data.title,
        coverLetter: data.coverLetter,
        targetEntityType: data.targetEntityType,
        serviceConfig: JSON.stringify(deepCloneJson(data.serviceConfig)),
        defaultPricing: JSON.stringify({ coverLetterTone: data.coverLetterTone || 'PROFESSIONAL' }),
        usageCount: 0,
      },
    });

    res.status(201).json({ success: true, data: template });
  })
);

/** POST /api/proposal-templates/:id/record-use */
router.post(
  '/:id/record-use',
  authenticate,
  asyncHandler(async (req, res) => {
    const template = await prisma.proposalTemplate.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId!, isActive: true },
    });
    if (!template) throw new ApiError('NOT_FOUND', 'Template not found', 404);

    await prisma.proposalTemplate.update({
      where: { id: template.id },
      data: {
        usageCount: (template.usageCount || 0) + 1,
        lastUsedAt: new Date(),
      },
    });

    res.json({ success: true });
  })
);

/** DELETE /api/proposal-templates/:id */
router.delete(
  '/:id',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.proposalTemplate.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });
    if (!existing) throw new ApiError('NOT_FOUND', 'Template not found', 404);

    await prisma.proposalTemplate.update({
      where: { id: existing.id },
      data: { isActive: false },
    });

    res.json({ success: true });
  })
);

export default router;