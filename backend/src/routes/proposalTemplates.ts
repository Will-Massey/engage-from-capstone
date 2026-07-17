/**
 * Proposal templates — save and reuse proposal configurations per tenant
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { penceToPounds } from '../utils/proposalPricing.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { deepCloneJson } from '../utils/proposalServiceSnapshot.js';
import { getCurrentVersionId } from '../services/engagementLibraryVersionService.js';
import {
  seedProposalTemplatesForTenant,
  sanityCheckTemplatePricing,
  getExpectedPackageCount,
  countLibraryTemplatesForTenant,
} from '../services/proposalTemplateSeedService.js';
import { countActiveServicesForTenant } from '../services/catalogueSeedService.js';
import { provisionTenantEngageLibraryBatched } from '../services/tenantLibraryProvisionService.js';

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

type ParsedServiceConfigItem = {
  serviceId: string;
  name?: string;
  description?: string | null;
  billingFrequency?: string;
  displayPrice?: number;
  quantity?: number;
  discountPercent?: number;
};

function normalizeServiceConfigItem(raw: unknown): ParsedServiceConfigItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const serviceId =
    typeof item.serviceId === 'string'
      ? item.serviceId
      : typeof item.serviceTemplateId === 'string'
        ? item.serviceTemplateId
        : null;
  if (!serviceId) return null;
  return {
    serviceId,
    name: typeof item.name === 'string' ? item.name : undefined,
    description:
      typeof item.description === 'string' || item.description === null
        ? (item.description as string | null)
        : undefined,
    billingFrequency: typeof item.billingFrequency === 'string' ? item.billingFrequency : undefined,
    displayPrice: typeof item.displayPrice === 'number' ? item.displayPrice : undefined,
    quantity: typeof item.quantity === 'number' ? item.quantity : undefined,
    discountPercent: typeof item.discountPercent === 'number' ? item.discountPercent : undefined,
  };
}

function parseServiceConfig(raw: string): ParsedServiceConfigItem[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return deepCloneJson(
      parsed
        .map(normalizeServiceConfigItem)
        .filter((item): item is ParsedServiceConfigItem => item !== null)
    );
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
    const expected = getExpectedPackageCount();
    let libraryCount = await countLibraryTemplatesForTenant(req.tenantId!);
    let catalogueCount = await countActiveServicesForTenant(req.tenantId!);
    let libraryComplete = libraryCount >= expected;

    if (!libraryComplete) {
      const provision = await provisionTenantEngageLibraryBatched(req.tenantId!, req.user!.id, {
        maxBatches: 4,
        batchSize: 50,
      });
      libraryCount = provision.libraryActive;
      libraryComplete = provision.libraryComplete;
      catalogueCount = await countActiveServicesForTenant(req.tenantId!);
    }

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
        needsUpdate: true,
        isDefault: true,
        engagementLibraryVersion: { select: { versionLabel: true } },
      },
    });

    res.json({
      success: true,
      data: templates.map((t) => ({
        ...t,
        serviceCount: parseServiceConfig(t.serviceConfig).length,
        coverLetterTone: parseDefaultPricing(t.defaultPricing).coverLetterTone,
        isLibraryTemplate: t.isDefault === true,
      })),
      meta: {
        expectedLibraryCount: expected,
        libraryActive: templates.filter((t) => t.isDefault === true).length,
        customActive: templates.filter((t) => t.isDefault !== true).length,
        totalActive: templates.length,
        catalogueActive: catalogueCount,
        libraryComplete,
      },
    });
  })
);

const seedLibraryQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  includeSanity: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

/** POST /api/proposal-templates/seed-library — seed ICAEW/ACCA template packages (chunked) */
router.post(
  '/seed-library',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    const query = seedLibraryQuerySchema.parse(req.query);
    const seed = await seedProposalTemplatesForTenant(req.tenantId!, req.user!.id, {
      offset: query.offset,
      limit: query.limit,
    });

    if (!seed.hasMore) {
      await prisma.activityLog.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.user!.id,
          action: 'PROPOSAL_TEMPLATE_LIBRARY_SEEDED',
          entityType: 'PROPOSAL_TEMPLATE',
          entityId: req.tenantId!,
          description: `Seeded proposal template library: ${seed.totalActive} active templates`,
        },
      });
    }

    const sanity =
      query.includeSanity || !seed.hasMore
        ? await sanityCheckTemplatePricing(req.tenantId!)
        : undefined;

    res.json({
      success: true,
      data: {
        expectedPackages: getExpectedPackageCount(),
        seed,
        ...(sanity ? { sanity } : {}),
      },
    });
  })
);

/** GET /api/proposal-templates/pricing-sanity — verify template prices match catalogue */
router.get(
  '/pricing-sanity',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    const sanity = await sanityCheckTemplatePricing(req.tenantId!);
    res.json({
      success: true,
      data: {
        expectedPackages: getExpectedPackageCount(),
        sanity,
      },
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
  authorize('ADMIN', 'PARTNER', 'MD', 'MANAGER', 'SENIOR'),
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
          displayPrice: penceToPounds(s.displayPricePence),
          quantity: s.quantity,
          discountPercent: s.discountPercent,
        }))
    );

    if (!serviceConfig.length) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'Proposal has no catalogue services to save as a template',
        400
      );
    }

    const libraryVersionId = await getCurrentVersionId();

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
        isDefault: false,
        engagementLibraryVersionId: libraryVersionId,
        needsUpdate: false,
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
  authorize('ADMIN', 'PARTNER', 'MD', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const data = createTemplateSchema.parse(req.body);
    const libraryVersionId = await getCurrentVersionId();

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
        isDefault: false,
        engagementLibraryVersionId: libraryVersionId,
        needsUpdate: false,
      },
    });

    res.status(201).json({ success: true, data: template });
  })
);

const updateTemplateSchema = createTemplateSchema
  .partial()
  .refine((data) => Object.keys(data).some((k) => data[k as keyof typeof data] !== undefined), {
    message: 'At least one field is required',
  });

/** PUT /api/proposal-templates/:id */
router.put(
  '/:id',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MD', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.proposalTemplate.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId!, isActive: true },
    });
    if (!existing) throw new ApiError('NOT_FOUND', 'Template not found', 404);

    const data = updateTemplateSchema.parse(req.body);
    const libraryVersionId = await getCurrentVersionId();

    const template = await prisma.proposalTemplate.update({
      where: { id: existing.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.title !== undefined && { title: data.title }),
        ...(data.coverLetter !== undefined && { coverLetter: data.coverLetter }),
        ...(data.targetEntityType !== undefined && { targetEntityType: data.targetEntityType }),
        ...(data.serviceConfig !== undefined && {
          serviceConfig: JSON.stringify(deepCloneJson(data.serviceConfig)),
        }),
        ...(data.coverLetterTone !== undefined && {
          defaultPricing: JSON.stringify({
            ...parseDefaultPricing(existing.defaultPricing),
            coverLetterTone: data.coverLetterTone,
          }),
        }),
        engagementLibraryVersionId: libraryVersionId,
        needsUpdate: false,
      },
    });

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
  authorize('ADMIN', 'PARTNER', 'MD', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.proposalTemplate.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });
    if (!existing) throw new ApiError('NOT_FOUND', 'Template not found', 404);
    if (existing.isDefault) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'Engage library templates cannot be deleted — create your own custom template instead',
        400
      );
    }

    await prisma.proposalTemplate.update({
      where: { id: existing.id },
      data: { isActive: false },
    });

    res.json({ success: true });
  })
);

export default router;
