"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const database_js_1 = require("../config/database.js");
const auth_js_1 = require("../middleware/auth.js");
const errorHandler_js_1 = require("../middleware/errorHandler.js");
const mtditsa_js_1 = require("../services/mtditsa.js");
const logger_js_1 = __importDefault(require("../config/logger.js"));
// Validation helper functions
const validateUKPostcode = (postcode) => {
    const postcodeRegex = /^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$/i;
    return postcodeRegex.test(postcode);
};
const validateUTR = (utr) => {
    const utrRegex = /^\d{10}$/;
    return utrRegex.test(utr);
};
const validateCompanyNumber = (number) => {
    const companyNumberRegex = /^[A-Za-z0-9]{6,8}$/;
    return companyNumberRegex.test(number);
};
const router = (0, express_1.Router)();
// Validation schemas - relaxed validation, only required fields
const addressSchema = zod_1.z.object({
    line1: zod_1.z.string().optional(),
    line2: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
    postcode: zod_1.z.string().optional(),
    country: zod_1.z.string().default('United Kingdom'),
});
const createClientSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Client name is required'),
    companyType: zod_1.z.nativeEnum(client_1.CompanyType),
    contactEmail: zod_1.z.string().min(1, 'Email is required'),
    contactPhone: zod_1.z.string().optional(),
    contactName: zod_1.z.string().optional(),
    companyNumber: zod_1.z.string().optional(),
    utr: zod_1.z.string().optional(),
    vatNumber: zod_1.z.string().optional(),
    vatRegistered: zod_1.z.boolean().default(false),
    address: addressSchema.optional(),
    industry: zod_1.z.string().optional(),
    employeeCount: zod_1.z.number().int().min(0).optional(),
    turnover: zod_1.z.number().min(0).optional(),
    yearEnd: zod_1.z.string().optional(),
    mtditsaIncome: zod_1.z.number().min(0).optional(),
    notes: zod_1.z.string().optional(),
    tags: zod_1.z.array(zod_1.z.string()).optional(),
});
const updateClientSchema = createClientSchema.partial();
const incomeSourceSchema = zod_1.z.object({
    type: zod_1.z.enum(['SELF_EMPLOYMENT', 'PROPERTY', 'PARTNERSHIP', 'OTHER']),
    amount: zod_1.z.number().min(0),
});
/**
 * GET /api/clients
 * List clients for tenant
 */
router.get('/', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { search, companyType, mtditsaStatus, page = '1', limit = '20', sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    logger_js_1.default.info(`Fetching clients for tenant: ${req.tenantId}, user: ${req.user?.id}`);
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);
    // Build where clause
    const where = {
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
            { name: { contains: search, mode: 'insensitive' } },
            { contactEmail: { contains: search, mode: 'insensitive' } },
            { companyNumber: { contains: search, mode: 'insensitive' } },
            { utr: { contains: search, mode: 'insensitive' } },
        ];
    }
    // Get clients with count
    const [clients, total] = await Promise.all([
        database_js_1.prisma.client.findMany({
            where,
            include: {
                _count: {
                    select: { proposals: true },
                },
            },
            skip,
            take,
            orderBy: { [sortBy]: sortOrder },
        }),
        database_js_1.prisma.client.count({ where }),
    ]);
    res.json({
        success: true,
        data: clients,
        meta: {
            page: parseInt(page),
            limit: take,
            total,
            totalPages: Math.ceil(total / take),
        },
    });
}));
/**
 * GET /api/clients/:id
 * Get single client
 */
router.get('/:id', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const client = await database_js_1.prisma.client.findFirst({
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
        throw new errorHandler_js_1.ApiError('NOT_FOUND', 'Client not found', 404);
    }
    res.json({
        success: true,
        data: client,
    });
}));
/**
 * POST /api/clients
 * Create new client
 */
router.post('/', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const data = createClientSchema.parse(req.body);
    logger_js_1.default.info(`Creating client for tenant: ${req.tenantId}, user: ${req.user?.id}, email: ${data.contactEmail}`);
    // Check for duplicate email
    const existingClient = await database_js_1.prisma.client.findFirst({
        where: {
            tenantId: req.tenantId,
            contactEmail: data.contactEmail,
        },
    });
    if (existingClient) {
        logger_js_1.default.warn(`Duplicate client email: ${data.contactEmail} for tenant: ${req.tenantId}`);
        throw new errorHandler_js_1.ApiError('DUPLICATE_EMAIL', 'A client with this email already exists', 409);
    }
    // Calculate MTD ITSA status if income provided AND client is a sole trader or partnership
    // MTD ITSA only applies to self-employed individuals (sole traders) and some partnerships
    // Limited companies, LLPs, charities, and non-profits are NOT subject to MTD ITSA
    let mtditsaStatus = client_1.MTDITSAStatus.NOT_REQUIRED;
    let mtditsaEligible = false;
    const isMtditsaApplicable = data.companyType === client_1.CompanyType.SOLE_TRADER ||
        data.companyType === client_1.CompanyType.PARTNERSHIP;
    if (data.mtditsaIncome && isMtditsaApplicable) {
        const assessment = mtditsa_js_1.MTDITSAService.calculateStatus(data.mtditsaIncome, [], {
            isCharity: data.companyType === client_1.CompanyType.CHARITY,
        });
        mtditsaStatus = assessment.status;
        mtditsaEligible = assessment.isRequired;
    }
    // Create client - omit tags and address from spread since we handle them separately
    const { tags, address, ...clientData } = data;
    const client = await database_js_1.prisma.client.create({
        data: {
            ...clientData,
            tenantId: req.tenantId,
            mtditsaStatus,
            mtditsaEligible,
            address: address ? JSON.stringify(address) : undefined,
            tags: tags ? tags.join(',') : '',
        },
    });
    // Log activity
    await database_js_1.prisma.activityLog.create({
        data: {
            tenantId: req.tenantId,
            userId: req.user.id,
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
}));
/**
 * PUT /api/clients/:id
 * Update client
 */
router.put('/:id', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const data = updateClientSchema.parse(req.body);
    // Check client exists
    const existingClient = await database_js_1.prisma.client.findFirst({
        where: {
            id,
            tenantId: req.tenantId,
        },
    });
    if (!existingClient) {
        throw new errorHandler_js_1.ApiError('NOT_FOUND', 'Client not found', 404);
    }
    // Check email uniqueness if changing
    if (data.contactEmail && data.contactEmail !== existingClient.contactEmail) {
        const duplicateEmail = await database_js_1.prisma.client.findFirst({
            where: {
                tenantId: req.tenantId,
                contactEmail: data.contactEmail,
                id: { not: id },
            },
        });
        if (duplicateEmail) {
            throw new errorHandler_js_1.ApiError('DUPLICATE_EMAIL', 'A client with this email already exists', 409);
        }
    }
    // Recalculate MTD ITSA status if income changed AND client is applicable type
    // MTD ITSA only applies to sole traders and partnerships
    let mtditsaData = {};
    const companyType = data.companyType || existingClient.companyType;
    const isMtditsaApplicable = companyType === client_1.CompanyType.SOLE_TRADER ||
        companyType === client_1.CompanyType.PARTNERSHIP;
    if (data.mtditsaIncome !== undefined && isMtditsaApplicable) {
        const assessment = mtditsa_js_1.MTDITSAService.calculateStatus(data.mtditsaIncome, [], {
            isCharity: false, // Already filtered for SOLE_TRADER/PARTNERSHIP
        });
        mtditsaData = {
            mtditsaStatus: assessment.status,
            mtditsaEligible: assessment.isRequired,
        };
    }
    else if (data.mtditsaIncome !== undefined && !isMtditsaApplicable) {
        // If client type changed to non-applicable, reset MTD ITSA status
        mtditsaData = {
            mtditsaStatus: client_1.MTDITSAStatus.NOT_REQUIRED,
            mtditsaEligible: false,
        };
    }
    // Update client
    const { tags: updateTags, address: updateAddress, ...updateData } = data;
    const client = await database_js_1.prisma.client.update({
        where: { id },
        data: {
            ...updateData,
            ...mtditsaData,
            address: updateAddress,
            tags: updateTags ? updateTags.join(',') : undefined,
        },
    });
    // Log activity
    await database_js_1.prisma.activityLog.create({
        data: {
            tenantId: req.tenantId,
            userId: req.user.id,
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
}));
/**
 * POST /api/clients/:id/mtditsa-assessment
 * Run MTD ITSA assessment for client
 * NOTE: MTD ITSA only applies to SOLE_TRADER and PARTNERSHIP entity types
 */
router.post('/:id/mtditsa-assessment', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const { incomeSources = [] } = zod_1.z.object({
        incomeSources: zod_1.z.array(incomeSourceSchema).optional(),
    }).parse(req.body);
    const client = await database_js_1.prisma.client.findFirst({
        where: {
            id,
            tenantId: req.tenantId,
        },
    });
    if (!client) {
        throw new errorHandler_js_1.ApiError('NOT_FOUND', 'Client not found', 404);
    }
    // MTD ITSA only applies to sole traders and partnerships
    const isMtditsaApplicable = client.companyType === client_1.CompanyType.SOLE_TRADER ||
        client.companyType === client_1.CompanyType.PARTNERSHIP;
    if (!isMtditsaApplicable) {
        throw new errorHandler_js_1.ApiError('NOT_APPLICABLE', `MTD ITSA does not apply to ${client.companyType.toLowerCase().replace('_', ' ')} entities. It only applies to sole traders and partnerships.`, 400);
    }
    const annualIncome = client.mtditsaIncome || client.turnover || 0;
    const assessment = mtditsa_js_1.MTDITSAService.calculateStatus(annualIncome, incomeSources, {
        isCharity: false, // Already validated as SOLE_TRADER or PARTNERSHIP
        partnershipTurnover: incomeSources.find(s => s.type === 'PARTNERSHIP')?.amount,
    });
    // Update client with new status
    await database_js_1.prisma.client.update({
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
            obligationExplanation: mtditsa_js_1.MTDITSAService.getObligationExplanation(assessment.status),
            softwareRecommendations: mtditsa_js_1.MTDITSAService.getSoftwareRecommendations(),
            serviceRecommendations: mtditsa_js_1.MTDITSAService.generateServiceRecommendations(assessment),
        },
    });
}));
/**
 * GET /api/clients/:id/mtditsa-timeline
 * Get MTD ITSA quarterly timeline for client
 */
router.get('/:id/mtditsa-timeline', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const { taxYear = new Date().getFullYear() } = req.query;
    const client = await database_js_1.prisma.client.findFirst({
        where: {
            id,
            tenantId: req.tenantId,
        },
    });
    if (!client) {
        throw new errorHandler_js_1.ApiError('NOT_FOUND', 'Client not found', 404);
    }
    const deadlines = mtditsa_js_1.MTDITSAService.calculateQuarterlyDeadlines(parseInt(taxYear));
    res.json({
        success: true,
        data: {
            taxYear: parseInt(taxYear),
            clientStatus: client.mtditsaStatus,
            isEligible: client.mtditsaEligible,
            quarterlyDeadlines: deadlines,
        },
    });
}));
/**
 * DELETE /api/clients/:id
 * Soft delete client
 */
router.delete('/:id', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'PARTNER', 'MANAGER'), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const client = await database_js_1.prisma.client.findFirst({
        where: {
            id,
            tenantId: req.tenantId,
        },
    });
    if (!client) {
        throw new errorHandler_js_1.ApiError('NOT_FOUND', 'Client not found', 404);
    }
    // Soft delete
    await database_js_1.prisma.client.update({
        where: { id },
        data: { isActive: false },
    });
    // Log activity
    await database_js_1.prisma.activityLog.create({
        data: {
            tenantId: req.tenantId,
            userId: req.user.id,
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
}));
/**
 * GET /api/clients/validate/utr/:utr
 * Validate UTR format
 */
router.get('/validate/utr/:utr', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
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
}));
/**
 * GET /api/clients/validate/company-number/:number
 * Validate company number format
 */
router.get('/validate/company-number/:number', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
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
}));
exports.default = router;
//# sourceMappingURL=clients.js.map