import { Router } from 'express';
import { z } from 'zod';
import { ServiceCategory, PricingModel, PricingFrequency, CompanyType } from '@prisma/client';
import { prisma } from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { PricingEngine } from '../services/pricingEngine.js';

const router = Router();

// Validation schemas
const complexityFactorSchema = z.object({
  name: z.string(),
  description: z.string(),
  multiplier: z.number().min(0.5).max(5),
  appliesTo: z.array(z.nativeEnum(CompanyType)).optional(),
});

const createServiceSchema = z.object({
  category: z.nativeEnum(ServiceCategory),
  subcategory: z.string().optional(),
  name: z.string().min(1, 'Service name is required'),
  description: z.string().min(1, 'Description is required'),
  longDescription: z.string().optional(),
  basePrice: z.number().min(0, 'Base price must be positive'),
  priceAmount: z.number().min(0).optional(),
  baseHours: z.number().min(0).optional(),
  pricingModel: z.nativeEnum(PricingModel).default('FIXED'),
  frequencyOptions: z
    .array(z.nativeEnum(PricingFrequency))
    .default(['MONTHLY', 'QUARTERLY', 'ANNUALLY']),
  defaultFrequency: z.nativeEnum(PricingFrequency).default('MONTHLY'),
  billingCycle: z.nativeEnum(PricingFrequency).optional(),
  complexityFactors: z.array(complexityFactorSchema).default([]),
  requirements: z.array(z.string()).default([]),
  deliverables: z.array(z.string()).default([]),
  applicableEntityTypes: z
    .array(z.nativeEnum(CompanyType))
    .default(['LIMITED_COMPANY', 'SOLE_TRADER']),
  regulatoryNotes: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

const updateServiceSchema = createServiceSchema.partial();

function mapFrequencyToBillingCycle(
  frequency: PricingFrequency | undefined
): import('@prisma/client').BillingCycle | undefined {
  if (!frequency) return undefined;
  if (frequency === 'ONE_TIME') return 'ONE_TIME';
  return frequency as import('@prisma/client').BillingCycle;
}

function buildServiceWriteData(data: z.infer<typeof createServiceSchema>, tenantId: string) {
  const billingCycle =
    mapFrequencyToBillingCycle(data.billingCycle as PricingFrequency | undefined) ??
    mapFrequencyToBillingCycle(data.defaultFrequency);

  return {
    category: data.category,
    subcategory: data.subcategory,
    name: data.name,
    description: data.description,
    longDescription: data.longDescription,
    basePrice: data.basePrice,
    priceAmount: data.priceAmount ?? data.basePrice,
    baseHours: data.baseHours,
    pricingModel: data.pricingModel,
    billingCycle: billingCycle ?? 'MONTHLY',
    defaultFrequency: data.defaultFrequency,
    frequencyOptions: (data.frequencyOptions ?? []).join(','),
    applicableEntityTypes: (data.applicableEntityTypes ?? []).join(','),
    complexityFactors: JSON.stringify(data.complexityFactors ?? []),
    requirements: JSON.stringify(data.requirements ?? []),
    deliverables: JSON.stringify(data.deliverables ?? []),
    regulatoryNotes: data.regulatoryNotes,
    tags: (data.tags ?? []).join(','),
    tenantId,
  };
}

const pricingRuleSchema = z.object({
  name: z.string().min(1, 'Rule name is required'),
  description: z.string().optional(),
  conditionField: z.string(),
  conditionOperator: z.enum(['EQ', 'GT', 'LT', 'GTE', 'LTE', 'IN']),
  conditionValue: z.any(),
  adjustmentType: z.enum(['PERCENTAGE', 'FIXED']),
  adjustmentValue: z.number(),
  priority: z.number().int().default(0),
});

/**
 * GET /api/services
 * List service templates
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const { category, entityType, search, includeInactive } = req.query;

    const where: any = {
      tenantId: req.tenantId,
    };

    if (!includeInactive || includeInactive !== 'true') {
      where.isActive = true;
    }

    if (category) {
      where.category = category;
    }

    if (entityType) {
      where.applicableEntityTypes = {
        has: entityType,
      };
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
        // tags is a comma-separated String column, not a list — `has` throws
        { tags: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const services = await prisma.serviceTemplate.findMany({
      where,
      include: {
        pricingRules: {
          where: { isActive: true },
          orderBy: { priority: 'desc' },
        },
      },
      orderBy: [{ category: 'asc' }, { isPopular: 'desc' }, { name: 'asc' }],
    });

    res.json({
      success: true,
      data: services,
    });
  })
);

/**
 * GET /api/services/categories
 * Get service categories
 */
router.get(
  '/categories',
  authenticate,
  asyncHandler(async (req, res) => {
    const categories = [
      {
        id: 'COMPLIANCE',
        name: 'Compliance',
        description: 'Essential regulatory compliance services',
        icon: 'clipboard-check',
      },
      {
        id: 'ADVISORY',
        name: 'Advisory',
        description: 'Strategic business advisory services',
        icon: 'lightbulb',
      },
      {
        id: 'TECHNICAL',
        name: 'Technical',
        description: 'Specialist technical accounting services',
        icon: 'calculator',
      },
      {
        id: 'SPECIALIZED',
        name: 'Specialised',
        description: 'Registered office and niche practice services',
        icon: 'star',
      },
    ];

    res.json({
      success: true,
      data: categories,
    });
  })
);

/**
 * GET /api/services/:id
 * Get single service template
 */
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const service = await prisma.serviceTemplate.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
      include: {
        pricingRules: {
          where: { isActive: true },
          orderBy: { priority: 'desc' },
        },
        _count: {
          select: { proposalServices: true },
        },
      },
    });

    if (!service) {
      throw new ApiError('NOT_FOUND', 'Service not found', 404);
    }

    res.json({
      success: true,
      data: service,
    });
  })
);

/**
 * POST /api/services
 * Create new service template
 */
router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MD', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const data = createServiceSchema.parse(req.body);

    const service = await prisma.serviceTemplate.create({
      data: buildServiceWriteData(data, req.tenantId!),
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user!.id,
        action: 'SERVICE_CREATED',
        entityType: 'SERVICE_TEMPLATE',
        entityId: service.id,
        description: `Created service "${service.name}"`,
      },
    });

    res.status(201).json({
      success: true,
      data: service,
    });
  })
);

/**
 * PUT /api/services/:id
 * Update service template
 */
router.put(
  '/:id',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MD', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Pre-process JSON string fields that may come from the API as strings
    if (typeof req.body.complexityFactors === 'string') {
      try {
        req.body.complexityFactors = JSON.parse(req.body.complexityFactors);
      } catch {
        req.body.complexityFactors = [];
      }
    }
    if (typeof req.body.requirements === 'string') {
      try {
        req.body.requirements = JSON.parse(req.body.requirements);
      } catch {
        req.body.requirements = [];
      }
    }
    if (typeof req.body.deliverables === 'string') {
      try {
        req.body.deliverables = JSON.parse(req.body.deliverables);
      } catch {
        req.body.deliverables = [];
      }
    }
    if (typeof req.body.tags === 'string') {
      req.body.tags = req.body.tags.split(',').filter(Boolean);
    }

    const data = updateServiceSchema.parse(req.body);

    const existingService = await prisma.serviceTemplate.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!existingService) {
      throw new ApiError('NOT_FOUND', 'Service not found', 404);
    }

    const updateData: any = {
      category: data.category,
      subcategory: data.subcategory,
      name: data.name,
      description: data.description,
      longDescription: data.longDescription,
      basePrice: data.basePrice,
      priceAmount: data.priceAmount,
      baseHours: data.baseHours,
      pricingModel: data.pricingModel,
      defaultFrequency: data.defaultFrequency,
      regulatoryNotes: data.regulatoryNotes,
      complexityFactors: data.complexityFactors
        ? JSON.stringify(data.complexityFactors)
        : undefined,
      requirements: data.requirements ? JSON.stringify(data.requirements) : undefined,
      deliverables: data.deliverables ? JSON.stringify(data.deliverables) : undefined,
      frequencyOptions:
        data.frequencyOptions !== undefined ? data.frequencyOptions.join(',') : undefined,
      applicableEntityTypes:
        data.applicableEntityTypes !== undefined ? data.applicableEntityTypes.join(',') : undefined,
      tags: data.tags !== undefined ? data.tags.join(',') : undefined,
    };

    // Sync legacy pricing fields to v2 fields if v2 fields are not explicitly provided
    if (data.basePrice !== undefined && data.priceAmount === undefined) {
      updateData.priceAmount = data.basePrice;
    }
    if (data.billingCycle !== undefined || data.defaultFrequency !== undefined) {
      updateData.billingCycle =
        mapFrequencyToBillingCycle(data.billingCycle as PricingFrequency | undefined) ??
        mapFrequencyToBillingCycle(data.defaultFrequency);
    }

    const service = await prisma.serviceTemplate.update({
      where: { id },
      data: updateData,
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user!.id,
        action: 'SERVICE_UPDATED',
        entityType: 'SERVICE_TEMPLATE',
        entityId: service.id,
        description: `Updated service "${service.name}"`,
      },
    });

    res.json({
      success: true,
      data: service,
    });
  })
);

/**
 * POST /api/services/:id/duplicate
 * Duplicate service template
 */
router.post(
  '/:id/duplicate',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existingService = await prisma.serviceTemplate.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!existingService) {
      throw new ApiError('NOT_FOUND', 'Service not found', 404);
    }

    // Create duplicate with "Copy of" prefix
    const service = await prisma.serviceTemplate.create({
      data: {
        ...existingService,
        id: undefined, // Let Prisma generate new ID
        name: `Copy of ${existingService.name}`,
        isActive: true,
        isPopular: false,
        createdAt: undefined,
        updatedAt: undefined,
      },
    });

    // Copy pricing rules
    const pricingRules = await prisma.pricingRule.findMany({
      where: { serviceId: id },
    });

    await Promise.all(
      pricingRules.map((rule) =>
        prisma.pricingRule.create({
          data: {
            ...rule,
            id: undefined,
            serviceId: service.id,
            createdAt: undefined,
            updatedAt: undefined,
          },
        })
      )
    );

    res.status(201).json({
      success: true,
      data: service,
    });
  })
);

/**
 * POST /api/services/:id/pricing-rules
 * Add pricing rule to service
 */
router.post(
  '/:id/pricing-rules',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = pricingRuleSchema.parse(req.body);

    const service = await prisma.serviceTemplate.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!service) {
      throw new ApiError('NOT_FOUND', 'Service not found', 404);
    }

    const rule = await prisma.pricingRule.create({
      data: {
        ...(data as any),
        tenantId: req.tenantId,
        serviceId: id,
        conditionValue: data.conditionValue,
        isActive: true,
      } as any,
    });

    res.status(201).json({
      success: true,
      data: rule,
    });
  })
);

/**
 * POST /api/services/calculate-price
 * Calculate price for a service
 */
router.post(
  '/calculate-price',
  authenticate,
  asyncHandler(async (req, res) => {
    const {
      serviceId,
      clientData,
      quantity = 1,
    } = z
      .object({
        serviceId: z.string(),
        clientData: z.object({
          turnover: z.number().optional(),
          employeeCount: z.number().optional(),
          transactionVolume: z.number().optional(),
          region: z.string().optional(),
          recordQuality: z.enum(['GOOD', 'AVERAGE', 'POOR']).optional(),
        }),
        quantity: z.number().min(1).optional(),
      })
      .parse(req.body);

    const pricingEngine = new PricingEngine(req.tenantId);
    const calculation = await pricingEngine.calculatePrice(serviceId, clientData, { quantity });

    res.json({
      success: true,
      data: calculation,
    });
  })
);

/**
 * POST /api/services/import-csv
 * Bulk import service catalog from CSV text body.
 * Columns: name, category, description, basePrice, baseHours, billingCycle, tags (optional)
 */
router.post(
  '/import-csv',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      csv: z.string().min(10),
      skipHeader: z.boolean().default(true),
    });
    const { csv, skipHeader } = schema.parse(req.body);
    const tenantId = req.tenantId!;

    const lines = csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const dataLines = skipHeader ? lines.slice(1) : lines;
    const created: string[] = [];
    const errors: Array<{ line: number; error: string }> = [];

    const validCategories = new Set(Object.values(ServiceCategory));

    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i];
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      const [name, category, description, basePriceStr, baseHoursStr, billingCycle, tags] = cols;

      if (!name || !category || !description) {
        errors.push({ line: i + 1, error: 'name, category, and description are required' });
        continue;
      }

      const categoryUpper = category.toUpperCase().replace(/\s+/g, '_') as ServiceCategory;
      if (!validCategories.has(categoryUpper)) {
        errors.push({ line: i + 1, error: `Invalid category: ${category}` });
        continue;
      }

      const basePrice = parseFloat(basePriceStr || '0');
      const baseHours = parseFloat(baseHoursStr || '1');
      if (Number.isNaN(basePrice) || basePrice < 0) {
        errors.push({ line: i + 1, error: 'Invalid basePrice' });
        continue;
      }

      const freq = (billingCycle || 'MONTHLY').toUpperCase() as PricingFrequency;
      const validFreq = Object.values(PricingFrequency).includes(freq)
        ? freq
        : PricingFrequency.MONTHLY;

      try {
        const service = await prisma.serviceTemplate.create({
          data: {
            tenantId,
            name,
            category: categoryUpper,
            description,
            basePrice,
            priceAmount: basePrice,
            baseHours: baseHours > 0 ? baseHours : 1,
            billingCycle: validFreq as any,
            defaultFrequency: validFreq,
            tags: tags || '',
            applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER',
          },
        });
        created.push(service.id);
      } catch (err: any) {
        errors.push({ line: i + 1, error: err.message || 'Create failed' });
      }
    }

    if (created.length) {
      await prisma.activityLog.create({
        data: {
          tenantId,
          userId: req.user!.id,
          action: 'SERVICES_IMPORTED',
          entityType: 'SERVICE_TEMPLATE',
          description: `Imported ${created.length} services from CSV`,
          metadata: JSON.stringify({ count: created.length, errors: errors.length }),
        },
      });
    }

    res.json({
      success: true,
      data: {
        imported: created.length,
        failed: errors.length,
        errors: errors.slice(0, 20),
        serviceIds: created,
      },
    });
  })
);

/**
 * DELETE /api/services/:id
 * Soft delete service template
 */
router.delete(
  '/:id',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const service = await prisma.serviceTemplate.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!service) {
      throw new ApiError('NOT_FOUND', 'Service not found', 404);
    }

    await prisma.serviceTemplate.update({
      where: { id },
      data: { isActive: false },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user!.id,
        action: 'SERVICE_DEACTIVATED',
        entityType: 'SERVICE_TEMPLATE',
        entityId: service.id,
        description: `Deactivated service "${service.name}"`,
      },
    });

    res.json({
      success: true,
      data: { message: 'Service deactivated successfully' },
    });
  })
);

export default router;
