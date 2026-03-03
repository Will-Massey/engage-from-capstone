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
  baseHours: z.number().min(0.1, 'Base hours must be at least 0.1'),
  pricingModel: z.nativeEnum(PricingModel).default('FIXED'),
  frequencyOptions: z.array(z.nativeEnum(PricingFrequency)).default(['MONTHLY', 'QUARTERLY', 'ANNUALLY']),
  defaultFrequency: z.nativeEnum(PricingFrequency).default('MONTHLY'),
  complexityFactors: z.array(complexityFactorSchema).default([]),
  requirements: z.array(z.string()).default([]),
  deliverables: z.array(z.string()).default([]),
  applicableEntityTypes: z.array(z.nativeEnum(CompanyType)).default(['LIMITED_COMPANY', 'SOLE_TRADER']),
  regulatoryNotes: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

const updateServiceSchema = createServiceSchema.partial();

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
        { tags: { has: search as string } },
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
      orderBy: [
        { category: 'asc' },
        { isPopular: 'desc' },
        { name: 'asc' },
      ],
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
        name: 'Specialized',
        description: 'Niche and specialized services',
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
  authorize('PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const data = createServiceSchema.parse(req.body);

    const service = await prisma.serviceTemplate.create({
      data: {
        ...data,
        tenantId: req.tenantId,
        complexityFactors: data.complexityFactors as any,
        requirements: data.requirements,
        deliverables: data.deliverables,
        tags: data.tags,
      },
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
  authorize('PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
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

    const service = await prisma.serviceTemplate.update({
      where: { id },
      data: {
        ...data,
        complexityFactors: data.complexityFactors as any,
        requirements: data.requirements,
        deliverables: data.deliverables,
        tags: data.tags,
      },
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
  authorize('PARTNER', 'MANAGER', 'SENIOR'),
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
  authorize('PARTNER', 'MANAGER'),
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
        ...data,
        tenantId: req.tenantId,
        serviceId: id,
        conditionValue: data.conditionValue,
        isActive: true,
      },
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
    const { serviceId, clientData, quantity = 1 } = z.object({
      serviceId: z.string(),
      clientData: z.object({
        turnover: z.number().optional(),
        employeeCount: z.number().optional(),
        transactionVolume: z.number().optional(),
        region: z.string().optional(),
        recordQuality: z.enum(['GOOD', 'AVERAGE', 'POOR']).optional(),
      }),
      quantity: z.number().min(1).optional(),
    }).parse(req.body);

    const pricingEngine = new PricingEngine(req.tenantId);
    const calculation = await pricingEngine.calculatePrice(
      serviceId,
      clientData,
      { quantity }
    );

    res.json({
      success: true,
      data: calculation,
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
  authorize('PARTNER', 'MANAGER'),
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
