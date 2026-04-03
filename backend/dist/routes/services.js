"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const database_js_1 = require("../config/database.js");
const auth_js_1 = require("../middleware/auth.js");
const errorHandler_js_1 = require("../middleware/errorHandler.js");
const pricingEngine_js_1 = require("../services/pricingEngine.js");
const router = (0, express_1.Router)();
// Validation schemas
const complexityFactorSchema = zod_1.z.object({
    name: zod_1.z.string(),
    description: zod_1.z.string(),
    multiplier: zod_1.z.number().min(0.5).max(5),
    appliesTo: zod_1.z.array(zod_1.z.nativeEnum(client_1.CompanyType)).optional(),
});
const createServiceSchema = zod_1.z.object({
    category: zod_1.z.nativeEnum(client_1.ServiceCategory),
    subcategory: zod_1.z.string().optional(),
    name: zod_1.z.string().min(1, 'Service name is required'),
    description: zod_1.z.string().min(1, 'Description is required'),
    longDescription: zod_1.z.string().optional(),
    basePrice: zod_1.z.number().min(0, 'Base price must be positive'),
    baseHours: zod_1.z.number().min(0.1, 'Base hours must be at least 0.1'),
    pricingModel: zod_1.z.nativeEnum(client_1.PricingModel).default('FIXED'),
    frequencyOptions: zod_1.z.array(zod_1.z.nativeEnum(client_1.PricingFrequency)).default(['MONTHLY', 'QUARTERLY', 'ANNUALLY']),
    defaultFrequency: zod_1.z.nativeEnum(client_1.PricingFrequency).default('MONTHLY'),
    complexityFactors: zod_1.z.array(complexityFactorSchema).default([]),
    requirements: zod_1.z.array(zod_1.z.string()).default([]),
    deliverables: zod_1.z.array(zod_1.z.string()).default([]),
    applicableEntityTypes: zod_1.z.array(zod_1.z.nativeEnum(client_1.CompanyType)).default(['LIMITED_COMPANY', 'SOLE_TRADER']),
    regulatoryNotes: zod_1.z.string().optional(),
    tags: zod_1.z.array(zod_1.z.string()).default([]),
});
const updateServiceSchema = createServiceSchema.partial();
const pricingRuleSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Rule name is required'),
    description: zod_1.z.string().optional(),
    conditionField: zod_1.z.string(),
    conditionOperator: zod_1.z.enum(['EQ', 'GT', 'LT', 'GTE', 'LTE', 'IN']),
    conditionValue: zod_1.z.any(),
    adjustmentType: zod_1.z.enum(['PERCENTAGE', 'FIXED']),
    adjustmentValue: zod_1.z.number(),
    priority: zod_1.z.number().int().default(0),
});
/**
 * GET /api/services
 * List service templates
 */
router.get('/', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { category, entityType, search, includeInactive } = req.query;
    const where = {
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
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { tags: { has: search } },
        ];
    }
    const services = await database_js_1.prisma.serviceTemplate.findMany({
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
}));
/**
 * GET /api/services/categories
 * Get service categories
 */
router.get('/categories', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
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
}));
/**
 * GET /api/services/:id
 * Get single service template
 */
router.get('/:id', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const service = await database_js_1.prisma.serviceTemplate.findFirst({
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
        throw new errorHandler_js_1.ApiError('NOT_FOUND', 'Service not found', 404);
    }
    res.json({
        success: true,
        data: service,
    });
}));
/**
 * POST /api/services
 * Create new service template
 */
router.post('/', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'PARTNER', 'MANAGER'), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const data = createServiceSchema.parse(req.body);
    const service = await database_js_1.prisma.serviceTemplate.create({
        data: {
            ...data,
            tenantId: req.tenantId,
            complexityFactors: JSON.stringify(data.complexityFactors),
            requirements: JSON.stringify(data.requirements),
            deliverables: JSON.stringify(data.deliverables),
            tags: data.tags?.join(','),
        },
    });
    // Log activity
    await database_js_1.prisma.activityLog.create({
        data: {
            tenantId: req.tenantId,
            userId: req.user.id,
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
}));
/**
 * PUT /api/services/:id
 * Update service template
 */
router.put('/:id', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'PARTNER', 'MANAGER'), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const data = updateServiceSchema.parse(req.body);
    const existingService = await database_js_1.prisma.serviceTemplate.findFirst({
        where: {
            id,
            tenantId: req.tenantId,
        },
    });
    if (!existingService) {
        throw new errorHandler_js_1.ApiError('NOT_FOUND', 'Service not found', 404);
    }
    const service = await database_js_1.prisma.serviceTemplate.update({
        where: { id },
        data: {
            ...data,
            complexityFactors: data.complexityFactors ? JSON.stringify(data.complexityFactors) : undefined,
            requirements: data.requirements ? JSON.stringify(data.requirements) : undefined,
            deliverables: data.deliverables ? JSON.stringify(data.deliverables) : undefined,
            tags: data.tags?.join(','),
        },
    });
    // Log activity
    await database_js_1.prisma.activityLog.create({
        data: {
            tenantId: req.tenantId,
            userId: req.user.id,
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
}));
/**
 * POST /api/services/:id/duplicate
 * Duplicate service template
 */
router.post('/:id/duplicate', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const existingService = await database_js_1.prisma.serviceTemplate.findFirst({
        where: {
            id,
            tenantId: req.tenantId,
        },
    });
    if (!existingService) {
        throw new errorHandler_js_1.ApiError('NOT_FOUND', 'Service not found', 404);
    }
    // Create duplicate with "Copy of" prefix
    const service = await database_js_1.prisma.serviceTemplate.create({
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
    const pricingRules = await database_js_1.prisma.pricingRule.findMany({
        where: { serviceId: id },
    });
    await Promise.all(pricingRules.map((rule) => database_js_1.prisma.pricingRule.create({
        data: {
            ...rule,
            id: undefined,
            serviceId: service.id,
            createdAt: undefined,
            updatedAt: undefined,
        },
    })));
    res.status(201).json({
        success: true,
        data: service,
    });
}));
/**
 * POST /api/services/:id/pricing-rules
 * Add pricing rule to service
 */
router.post('/:id/pricing-rules', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'PARTNER', 'MANAGER'), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const data = pricingRuleSchema.parse(req.body);
    const service = await database_js_1.prisma.serviceTemplate.findFirst({
        where: {
            id,
            tenantId: req.tenantId,
        },
    });
    if (!service) {
        throw new errorHandler_js_1.ApiError('NOT_FOUND', 'Service not found', 404);
    }
    const rule = await database_js_1.prisma.pricingRule.create({
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
}));
/**
 * POST /api/services/calculate-price
 * Calculate price for a service
 */
router.post('/calculate-price', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { serviceId, clientData, quantity = 1 } = zod_1.z.object({
        serviceId: zod_1.z.string(),
        clientData: zod_1.z.object({
            turnover: zod_1.z.number().optional(),
            employeeCount: zod_1.z.number().optional(),
            transactionVolume: zod_1.z.number().optional(),
            region: zod_1.z.string().optional(),
            recordQuality: zod_1.z.enum(['GOOD', 'AVERAGE', 'POOR']).optional(),
        }),
        quantity: zod_1.z.number().min(1).optional(),
    }).parse(req.body);
    const pricingEngine = new pricingEngine_js_1.PricingEngine(req.tenantId);
    const calculation = await pricingEngine.calculatePrice(serviceId, clientData, { quantity });
    res.json({
        success: true,
        data: calculation,
    });
}));
/**
 * DELETE /api/services/:id
 * Soft delete service template
 */
router.delete('/:id', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'PARTNER', 'MANAGER'), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const service = await database_js_1.prisma.serviceTemplate.findFirst({
        where: {
            id,
            tenantId: req.tenantId,
        },
    });
    if (!service) {
        throw new errorHandler_js_1.ApiError('NOT_FOUND', 'Service not found', 404);
    }
    await database_js_1.prisma.serviceTemplate.update({
        where: { id },
        data: { isActive: false },
    });
    // Log activity
    await database_js_1.prisma.activityLog.create({
        data: {
            tenantId: req.tenantId,
            userId: req.user.id,
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
}));
exports.default = router;
//# sourceMappingURL=services.js.map