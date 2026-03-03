import { Router } from 'express';
import { z } from 'zod';
import { CompanyType, MTDITSAStatus } from '@prisma/client';
import { prisma } from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { MTDITSAService } from '../services/mtditsa.js';
// Validation helper functions
const validateUKPostcode = (postcode: string): boolean => {
  const postcodeRegex = /^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$/i;
  return postcodeRegex.test(postcode);
};

const validateUTR = (utr: string): boolean => {
  const utrRegex = /^\d{10}$/;
  return utrRegex.test(utr);
};

const validateCompanyNumber = (number: string): boolean => {
  const companyNumberRegex = /^[A-Za-z0-9]{6,8}$/;
  return companyNumberRegex.test(number);
};

const router = Router();

// Validation schemas
const addressSchema = z.object({
  line1: z.string().min(1, 'Address line 1 is required'),
  line2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  postcode: z.string().regex(/^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$/i, 'Invalid UK postcode'),
  country: z.string().default('United Kingdom'),
});

const createClientSchema = z.object({
  name: z.string().min(1, 'Client name is required'),
  companyType: z.nativeEnum(CompanyType),
  contactEmail: z.string().email('Invalid email address'),
  contactPhone: z.string().optional(),
  contactName: z.string().optional(),
  companyNumber: z.string().optional(),
  utr: z.string().regex(/^\d{10}$/, 'UTR must be 10 digits').optional(),
  vatNumber: z.string().optional(),
  vatRegistered: z.boolean().default(false),
  address: addressSchema.optional(),
  industry: z.string().optional(),
  employeeCount: z.number().int().min(0).optional(),
  turnover: z.number().min(0).optional(),
  yearEnd: z.string().regex(/^\d{2}-\d{2}$/, 'Year end must be in MM-DD format').optional(),
  mtditsaIncome: z.number().min(0).optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const updateClientSchema = createClientSchema.partial();

const incomeSourceSchema = z.object({
  type: z.enum(['SELF_EMPLOYMENT', 'PROPERTY', 'PARTNERSHIP', 'OTHER']),
  amount: z.number().min(0),
});

/**
 * GET /api/clients
 * List clients for tenant
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const { 
      search, 
      companyType, 
      mtditsaStatus, 
      page = '1', 
      limit = '20',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    // Build where clause
    const where: any = {
      tenantId: req.tenantId,
      isActive: true,
    };

    if (companyType) {
      where.companyType = companyType;
    }

    if (mtditsaStatus) {
      where.mtditsaStatus = mtditsaStatus;
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { contactEmail: { contains: search as string, mode: 'insensitive' } },
        { companyNumber: { contains: search as string, mode: 'insensitive' } },
        { utr: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    // Get clients with count
    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        include: {
          _count: {
            select: { proposals: true },
          },
        },
        skip,
        take,
        orderBy: { [sortBy as string]: sortOrder },
      }),
      prisma.client.count({ where }),
    ]);

    res.json({
      success: true,
      data: clients,
      meta: {
        page: parseInt(page as string),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  })
);

/**
 * GET /api/clients/:id
 * Get single client
 */
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const client = await prisma.client.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
      include: {
        proposals: {
          select: {
            id: true,
            reference: true,
            title: true,
            status: true,
            total: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!client) {
      throw new ApiError('NOT_FOUND', 'Client not found', 404);
    }

    res.json({
      success: true,
      data: client,
    });
  })
);

/**
 * POST /api/clients
 * Create new client
 */
router.post(
  '/',
  authenticate,
  authorize('PARTNER', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const data = createClientSchema.parse(req.body);

    // Check for duplicate email
    const existingClient = await prisma.client.findFirst({
      where: {
        tenantId: req.tenantId,
        contactEmail: data.contactEmail,
      },
    });

    if (existingClient) {
      throw new ApiError('DUPLICATE_EMAIL', 'A client with this email already exists', 409);
    }

    // Calculate MTD ITSA status if income provided
    let mtditsaStatus: MTDITSAStatus = MTDITSAStatus.NOT_REQUIRED;
    let mtditsaEligible = false;

    if (data.mtditsaIncome) {
      const assessment = MTDITSAService.calculateStatus(
        data.mtditsaIncome,
        [],
        {
          isCharity: data.companyType === CompanyType.CHARITY,
        }
      );
      mtditsaStatus = assessment.status;
      mtditsaEligible = assessment.isRequired;
    }

    // Create client
    const client = await prisma.client.create({
      data: {
        ...data,
        tenantId: req.tenantId,
        mtditsaStatus,
        mtditsaEligible,
        address: data.address as any,
        tags: data.tags || [],
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user!.id,
        action: 'CLIENT_CREATED',
        entityType: 'CLIENT',
        entityId: client.id,
        description: `Created client "${client.name}"`,
      },
    });

    res.status(201).json({
      success: true,
      data: client,
    });
  })
);

/**
 * PUT /api/clients/:id
 * Update client
 */
router.put(
  '/:id',
  authenticate,
  authorize('PARTNER', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = updateClientSchema.parse(req.body);

    // Check client exists
    const existingClient = await prisma.client.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!existingClient) {
      throw new ApiError('NOT_FOUND', 'Client not found', 404);
    }

    // Check email uniqueness if changing
    if (data.contactEmail && data.contactEmail !== existingClient.contactEmail) {
      const duplicateEmail = await prisma.client.findFirst({
        where: {
          tenantId: req.tenantId,
          contactEmail: data.contactEmail,
          id: { not: id },
        },
      });

      if (duplicateEmail) {
        throw new ApiError('DUPLICATE_EMAIL', 'A client with this email already exists', 409);
      }
    }

    // Recalculate MTD ITSA status if income changed
    let mtditsaData = {};
    if (data.mtditsaIncome !== undefined) {
      const assessment = MTDITSAService.calculateStatus(
        data.mtditsaIncome,
        [],
        {
          isCharity: data.companyType === CompanyType.CHARITY || existingClient.companyType === CompanyType.CHARITY,
        }
      );
      mtditsaData = {
        mtditsaStatus: assessment.status,
        mtditsaEligible: assessment.isRequired,
      };
    }

    // Update client
    const client = await prisma.client.update({
      where: { id },
      data: {
        ...data,
        ...mtditsaData,
        address: data.address as any,
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user!.id,
        action: 'CLIENT_UPDATED',
        entityType: 'CLIENT',
        entityId: client.id,
        description: `Updated client "${client.name}"`,
      },
    });

    res.json({
      success: true,
      data: client,
    });
  })
);

/**
 * POST /api/clients/:id/mtditsa-assessment
 * Run MTD ITSA assessment for client
 */
router.post(
  '/:id/mtditsa-assessment',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { incomeSources = [] } = z.object({
      incomeSources: z.array(incomeSourceSchema).optional(),
    }).parse(req.body);

    const client = await prisma.client.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!client) {
      throw new ApiError('NOT_FOUND', 'Client not found', 404);
    }

    const annualIncome = client.mtditsaIncome || client.turnover || 0;

    const assessment = MTDITSAService.calculateStatus(
      annualIncome,
      incomeSources,
      {
        isCharity: client.companyType === CompanyType.CHARITY,
        partnershipTurnover: incomeSources.find(s => s.type === 'PARTNERSHIP')?.amount,
      }
    );

    // Update client with new status
    await prisma.client.update({
      where: { id },
      data: {
        mtditsaStatus: assessment.status,
        mtditsaEligible: assessment.isRequired,
      },
    });

    res.json({
      success: true,
      data: {
        ...assessment,
        obligationExplanation: MTDITSAService.getObligationExplanation(assessment.status),
        softwareRecommendations: MTDITSAService.getSoftwareRecommendations(),
        serviceRecommendations: MTDITSAService.generateServiceRecommendations(assessment),
      },
    });
  })
);

/**
 * GET /api/clients/:id/mtditsa-timeline
 * Get MTD ITSA quarterly timeline for client
 */
router.get(
  '/:id/mtditsa-timeline',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { taxYear = new Date().getFullYear() } = req.query;

    const client = await prisma.client.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!client) {
      throw new ApiError('NOT_FOUND', 'Client not found', 404);
    }

    const deadlines = MTDITSAService.calculateQuarterlyDeadlines(parseInt(taxYear as string));

    res.json({
      success: true,
      data: {
        taxYear: parseInt(taxYear as string),
        clientStatus: client.mtditsaStatus,
        isEligible: client.mtditsaEligible,
        quarterlyDeadlines: deadlines,
      },
    });
  })
);

/**
 * DELETE /api/clients/:id
 * Soft delete client
 */
router.delete(
  '/:id',
  authenticate,
  authorize('PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const client = await prisma.client.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!client) {
      throw new ApiError('NOT_FOUND', 'Client not found', 404);
    }

    // Soft delete
    await prisma.client.update({
      where: { id },
      data: { isActive: false },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user!.id,
        action: 'CLIENT_DELETED',
        entityType: 'CLIENT',
        entityId: client.id,
        description: `Deactivated client "${client.name}"`,
      },
    });

    res.json({
      success: true,
      data: { message: 'Client deactivated successfully' },
    });
  })
);

/**
 * GET /api/clients/validate/utr/:utr
 * Validate UTR format
 */
router.get(
  '/validate/utr/:utr',
  authenticate,
  asyncHandler(async (req, res) => {
    const { utr } = req.params;
    const isValid = validateUTR(utr);

    res.json({
      success: true,
      data: {
        utr,
        isValid,
        format: isValid ? 'Valid 10-digit UTR' : 'Invalid format',
      },
    });
  })
);

/**
 * GET /api/clients/validate/company-number/:number
 * Validate company number format
 */
router.get(
  '/validate/company-number/:number',
  authenticate,
  asyncHandler(async (req, res) => {
    const { number } = req.params;
    const isValid = validateCompanyNumber(number);

    res.json({
      success: true,
      data: {
        number,
        isValid,
        format: isValid ? 'Valid company number' : 'Invalid format',
      },
    });
  })
);

export default router;
