/**
 * Enhanced Services Routes
 * Billing cycles, VAT rates, and pre-planned services
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';
import {
  billingCycles,
  vatRates,
  allServices,
  serviceCategories,
} from '../data/ukAccountancyServices.js';

const router = Router();

// Get billing cycle options
router.get(
  '/billing-cycles',
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: billingCycles,
    });
  })
);

// Get VAT rate options
router.get(
  '/vat-rates',
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: vatRates,
    });
  })
);

// Get pre-planned service categories
router.get(
  '/categories',
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: serviceCategories,
    });
  })
);

// Get pre-planned services catalog
router.get(
  '/catalog',
  authenticate,
  asyncHandler(async (req, res) => {
    const { category, entityType } = req.query;

    let services = allServices;

    // Filter by category if provided
    if (category) {
      services = services.filter((s) => s.category === category);
    }

    // Filter by applicable entity type if provided
    if (entityType) {
      services = services.filter((s) =>
        s.applicableEntityTypes.includes(entityType as string)
      );
    }

    res.json({
      success: true,
      data: services,
      meta: {
        total: services.length,
        categories: [...new Set(services.map((s) => s.category))],
      },
    });
  })
);

// Import service from catalog to tenant
router.post(
  '/import-from-catalog',
  authenticate,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      serviceName: z.string(),
      customBasePrice: z.number().optional(),
    });

    const { serviceName, customBasePrice } = schema.parse(req.body);
    const tenantId = req.tenantId!;

    // Find service in catalog
    const catalogService = allServices.find((s) => s.name === serviceName);
    if (!catalogService) {
      throw new ApiError('SERVICE_NOT_FOUND', 'Service not found in catalog', 404);
    }

    // Check if service already exists for tenant
    const existing = await prisma.serviceTemplate.findFirst({
      where: {
        tenantId,
        name: catalogService.name,
      },
    });

    if (existing) {
      throw new ApiError(
        'SERVICE_EXISTS',
        'Service already exists in your practice',
        409
      );
    }

    // Create service from catalog
    const service = await prisma.serviceTemplate.create({
      data: {
        tenantId,
        category: catalogService.category as any,
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
        defaultFrequency: catalogService.defaultFrequency as any,
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
  })
);

// Bulk import services from catalog
router.post(
  '/bulk-import-catalog',
  authenticate,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      category: z.string().optional(),
    });

    const { category } = schema.parse(req.body);
    const tenantId = req.tenantId!;

    let servicesToImport = allServices;
    if (category) {
      servicesToImport = servicesToImport.filter((s) => s.category === category);
    }

    const results = {
      imported: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const catalogService of servicesToImport) {
      try {
        // Check if exists
        const existing = await prisma.serviceTemplate.findFirst({
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
        await prisma.serviceTemplate.create({
          data: {
            tenantId,
            category: catalogService.category as any,
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
            defaultFrequency: catalogService.defaultFrequency as any,
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
      } catch (error: any) {
        results.errors.push(`Failed to import ${catalogService.name}: ${error.message}`);
      }
    }

    res.json({
      success: true,
      data: results,
      message: `Imported ${results.imported} services, skipped ${results.skipped}`,
    });
  })
);

// Update service billing and VAT settings
router.put(
  '/:id/billing-vat',
  authenticate,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      billingCycle: z.enum(['FIXED_DATE', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY']),
      vatRate: z.enum(['ZERO', 'REDUCED_5', 'STANDARD_20', 'EXEMPT']),
      isVatApplicable: z.boolean(),
      fixedBillingDate: z.string().datetime().optional(),
      billingDayOfMonth: z.number().min(1).max(31).optional(),
      annualEquivalent: z.number().optional(),
    });

    const data = schema.parse(req.body);
    const { id } = req.params;
    const tenantId = req.tenantId!;

    const service = await prisma.serviceTemplate.updateMany({
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
      throw new ApiError('SERVICE_NOT_FOUND', 'Service not found', 404);
    }

    res.json({
      success: true,
      message: 'Billing and VAT settings updated',
    });
  })
);

export default router;
