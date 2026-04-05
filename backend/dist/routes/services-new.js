"use strict";
/**
 * Enhanced Services Routes
 * Billing cycles, VAT rates, and pre-planned services
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const database_js_1 = require("../config/database.js");
const errorHandler_js_1 = require("../middleware/errorHandler.js");
const auth_js_1 = require("../middleware/auth.js");
const ukAccountancyServices_js_1 = require("../data/ukAccountancyServices.js");
const router = (0, express_1.Router)();
// Get billing cycle options
router.get('/billing-cycles', (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    res.json({
        success: true,
        data: ukAccountancyServices_js_1.billingCycles,
    });
}));
// Get VAT rate options
router.get('/vat-rates', (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    res.json({
        success: true,
        data: ukAccountancyServices_js_1.vatRates,
    });
}));
// Get pre-planned service categories
router.get('/categories', (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    res.json({
        success: true,
        data: ukAccountancyServices_js_1.serviceCategories,
    });
}));
// Get pre-planned services catalog
router.get('/catalog', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { category, entityType } = req.query;
    let services = ukAccountancyServices_js_1.allServices;
    // Filter by category if provided
    if (category) {
        services = services.filter((s) => s.category === category);
    }
    // Filter by applicable entity type if provided
    if (entityType) {
        services = services.filter((s) => s.applicableEntityTypes.includes(entityType));
    }
    res.json({
        success: true,
        data: services,
        meta: {
            total: services.length,
            categories: [...new Set(services.map((s) => s.category))],
        },
    });
}));
// Import service from catalog to tenant
router.post('/import-from-catalog', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const schema = zod_1.z.object({
        serviceName: zod_1.z.string(),
        customBasePrice: zod_1.z.number().optional(),
    });
    const { serviceName, customBasePrice } = schema.parse(req.body);
    const tenantId = req.tenantId;
    // Find service in catalog
    const catalogService = ukAccountancyServices_js_1.allServices.find((s) => s.name === serviceName);
    if (!catalogService) {
        throw new errorHandler_js_1.ApiError('SERVICE_NOT_FOUND', 'Service not found in catalog', 404);
    }
    // Check if service already exists for tenant
    const existing = await database_js_1.prisma.serviceTemplate.findFirst({
        where: {
            tenantId,
            name: catalogService.name,
        },
    });
    if (existing) {
        throw new errorHandler_js_1.ApiError('SERVICE_EXISTS', 'Service already exists in your practice', 409);
    }
    // Create service from catalog
    const service = await database_js_1.prisma.serviceTemplate.create({
        data: {
            tenantId,
            category: catalogService.category,
            subcategory: catalogService.subcategory,
            name: catalogService.name,
            description: catalogService.description,
            longDescription: catalogService.longDescription,
            basePrice: customBasePrice ?? catalogService.basePrice,
            baseHours: catalogService.baseHours,
            pricingModel: catalogService.pricingModel,
            billingCycle: catalogService.billingCycle,
            vatRate: catalogService.vatRate,
            isVatApplicable: catalogService.isVatApplicable,
            frequencyOptions: catalogService.frequencyOptions.join(','),
            defaultFrequency: catalogService.defaultFrequency,
            applicableEntityTypes: catalogService.applicableEntityTypes.join(','),
            complexityFactors: JSON.stringify(catalogService.complexityFactors),
            requirements: JSON.stringify(catalogService.requirements),
            deliverables: JSON.stringify(catalogService.deliverables),
            regulatoryNotes: catalogService.regulatoryNotes,
            tags: catalogService.tags.join(','),
            isPopular: catalogService.isPopular,
            isActive: true,
        },
    });
    res.status(201).json({
        success: true,
        data: service,
        message: 'Service imported successfully',
    });
}));
// Bulk import services from catalog
router.post('/bulk-import-catalog', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const schema = zod_1.z.object({
        category: zod_1.z.string().optional(),
    });
    const { category } = schema.parse(req.body);
    const tenantId = req.tenantId;
    let servicesToImport = ukAccountancyServices_js_1.allServices;
    if (category) {
        servicesToImport = servicesToImport.filter((s) => s.category === category);
    }
    const results = {
        imported: 0,
        skipped: 0,
        errors: [],
    };
    for (const catalogService of servicesToImport) {
        try {
            // Check if exists
            const existing = await database_js_1.prisma.serviceTemplate.findFirst({
                where: {
                    tenantId,
                    name: catalogService.name,
                },
            });
            if (existing) {
                results.skipped++;
                continue;
            }
            // Create service
            await database_js_1.prisma.serviceTemplate.create({
                data: {
                    tenantId,
                    category: catalogService.category,
                    subcategory: catalogService.subcategory,
                    name: catalogService.name,
                    description: catalogService.description,
                    longDescription: catalogService.longDescription,
                    basePrice: catalogService.basePrice,
                    baseHours: catalogService.baseHours,
                    pricingModel: catalogService.pricingModel,
                    billingCycle: catalogService.billingCycle,
                    vatRate: catalogService.vatRate,
                    isVatApplicable: catalogService.isVatApplicable,
                    frequencyOptions: catalogService.frequencyOptions.join(','),
                    defaultFrequency: catalogService.defaultFrequency,
                    applicableEntityTypes: catalogService.applicableEntityTypes.join(','),
                    complexityFactors: JSON.stringify(catalogService.complexityFactors),
                    requirements: JSON.stringify(catalogService.requirements),
                    deliverables: JSON.stringify(catalogService.deliverables),
                    regulatoryNotes: catalogService.regulatoryNotes,
                    tags: catalogService.tags.join(','),
                    isPopular: catalogService.isPopular,
                    isActive: true,
                },
            });
            results.imported++;
        }
        catch (error) {
            results.errors.push(`Failed to import ${catalogService.name}: ${error.message}`);
        }
    }
    res.json({
        success: true,
        data: results,
        message: `Imported ${results.imported} services, skipped ${results.skipped}`,
    });
}));
// Update service billing and VAT settings
router.put('/:id/billing-vat', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const schema = zod_1.z.object({
        billingCycle: zod_1.z.enum(['FIXED_DATE', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY']),
        vatRate: zod_1.z.enum(['ZERO', 'REDUCED_5', 'STANDARD_20', 'EXEMPT']),
        isVatApplicable: zod_1.z.boolean(),
        fixedBillingDate: zod_1.z.string().datetime().optional(),
        billingDayOfMonth: zod_1.z.number().min(1).max(31).optional(),
        annualEquivalent: zod_1.z.number().optional(),
    });
    const data = schema.parse(req.body);
    const { id } = req.params;
    const tenantId = req.tenantId;
    const service = await database_js_1.prisma.serviceTemplate.updateMany({
        where: {
            id,
            tenantId,
        },
        data: {
            billingCycle: data.billingCycle,
            vatRate: data.vatRate,
            isVatApplicable: data.isVatApplicable,
            fixedBillingDate: data.fixedBillingDate ? new Date(data.fixedBillingDate) : null,
            billingDayOfMonth: data.billingDayOfMonth ?? null,
            annualEquivalent: data.annualEquivalent ?? null,
        },
    });
    if (service.count === 0) {
        throw new errorHandler_js_1.ApiError('SERVICE_NOT_FOUND', 'Service not found', 404);
    }
    res.json({
        success: true,
        message: 'Billing and VAT settings updated',
    });
}));
exports.default = router;
//# sourceMappingURL=services-new.js.map