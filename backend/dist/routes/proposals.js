"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const pricingEngine_js_1 = require("../services/pricingEngine.js");
const pdfGenerator_js_1 = require("../services/pdfGenerator.js");
const logger_js_1 = __importDefault(require("../config/logger.js"));
// generateReference helper function
const generateReference = (prefix = 'PROP') => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
};
const router = (0, express_1.Router)();
// Validation schemas
const createProposalSchema = zod_1.z.object({
    clientId: zod_1.z.string(),
    title: zod_1.z.string().min(1, 'Title is required'),
    templateId: zod_1.z.string().optional(),
    services: zod_1.z.array(zod_1.z.object({
        serviceId: zod_1.z.string(),
        quantity: zod_1.z.number().min(1).default(1),
        unitPrice: zod_1.z.number().min(0).optional(), // Allow custom unit price
        discountPercent: zod_1.z.number().min(0).max(100).optional(),
        frequency: zod_1.z.nativeEnum(client_1.PricingFrequency).optional(), // Billing frequency per service
    })).min(1, 'At least one service is required'),
    validUntil: zod_1.z.string().datetime().optional(),
    contractStartDate: zod_1.z.string().datetime().optional(), // When the contract begins
    paymentTerms: zod_1.z.string().optional(),
    paymentFrequency: zod_1.z.nativeEnum(client_1.PricingFrequency).optional(),
    coverLetter: zod_1.z.string().optional(),
    terms: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
    discountType: zod_1.z.enum(['PERCENTAGE', 'FIXED']).optional(),
    discountValue: zod_1.z.number().min(0).optional(),
});
const updateProposalSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).optional(),
    services: zod_1.z.array(zod_1.z.object({
        serviceId: zod_1.z.string(),
        quantity: zod_1.z.number().min(1),
        discountPercent: zod_1.z.number().min(0).max(100).optional(),
    })).optional(),
    validUntil: zod_1.z.string().datetime().optional(),
    paymentTerms: zod_1.z.string().optional(),
    coverLetter: zod_1.z.string().optional(),
    terms: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
    status: zod_1.z.nativeEnum(client_1.ProposalStatus).optional(),
    discountType: zod_1.z.enum(['PERCENTAGE', 'FIXED']).optional(),
    discountValue: zod_1.z.number().min(0).optional(),
});
/**
 * GET /api/proposals
 * List proposals for tenant
 */
router.get('/', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { status, clientId, search, page = '1', limit = '20' } = req.query;
    logger_js_1.default.info(`Fetching proposals for tenant: ${req.tenantId}, user: ${req.user?.id}`);
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);
    // Build where clause
    const where = {
        tenantId: req.tenantId,
    };
    if (status) {
        where.status = status;
    }
    if (clientId) {
        where.clientId = clientId;
    }
    if (search) {
        where.OR = [
            { title: { contains: search, mode: 'insensitive' } },
            { reference: { contains: search, mode: 'insensitive' } },
            { client: { name: { contains: search, mode: 'insensitive' } } },
        ];
    }
    // Get proposals with count
    const [proposals, total] = await Promise.all([
        database_js_1.prisma.proposal.findMany({
            where,
            include: {
                client: {
                    select: {
                        id: true,
                        name: true,
                        companyType: true,
                        contactEmail: true,
                    },
                },
                createdBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
                _count: {
                    select: { services: true, views: true },
                },
            },
            skip,
            take,
            orderBy: { createdAt: 'desc' },
        }),
        database_js_1.prisma.proposal.count({ where }),
    ]);
    res.json({
        success: true,
        data: proposals,
        meta: {
            page: parseInt(page),
            limit: take,
            total,
            totalPages: Math.ceil(total / take),
        },
    });
}));
/**
 * GET /api/proposals/:id
 * Get single proposal
 */
router.get('/:id', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const proposal = await database_js_1.prisma.proposal.findFirst({
        where: {
            id,
            tenantId: req.tenantId,
        },
        include: {
            client: true,
            services: {
                include: {
                    serviceTemplate: true,
                },
            },
            createdBy: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                },
            },
            documents: true,
            activityLogs: {
                include: {
                    user: {
                        select: {
                            firstName: true,
                            lastName: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                take: 20,
            },
        },
    });
    if (!proposal) {
        throw new errorHandler_js_1.ApiError('NOT_FOUND', 'Proposal not found', 404);
    }
    res.json({
        success: true,
        data: proposal,
    });
}));
/**
 * POST /api/proposals
 * Create new proposal
 */
router.post('/', auth_js_1.authenticate, (0, auth_js_1.authorize)('PARTNER', 'MANAGER', 'SENIOR', 'ADMIN'), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const data = createProposalSchema.parse(req.body);
    // Get client
    const client = await database_js_1.prisma.client.findFirst({
        where: {
            id: data.clientId,
            tenantId: req.tenantId,
        },
    });
    if (!client) {
        throw new errorHandler_js_1.ApiError('CLIENT_NOT_FOUND', 'Client not found', 404);
    }
    // Fetch service templates for frequency and name info
    const serviceTemplates = await database_js_1.prisma.serviceTemplate.findMany({
        where: {
            id: { in: data.services.map((s) => s.serviceId) },
        },
    });
    // Prepare services with custom pricing (bypass PricingEngine for custom prices)
    const servicesWithCustomPricing = data.services.map((svc) => {
        const template = serviceTemplates.find((t) => t.id === svc.serviceId);
        // Use custom unit price if provided, otherwise use template base price
        const finalUnitPrice = svc.unitPrice !== undefined && svc.unitPrice > 0
            ? svc.unitPrice
            : (template?.basePrice || 0);
        // Recalculate total with custom unit price
        const quantity = svc.quantity || 1;
        const discountPercent = svc.discountPercent || 0;
        const baseTotal = finalUnitPrice * quantity;
        const discountAmount = baseTotal * (discountPercent / 100);
        const finalTotal = baseTotal - discountAmount;
        return {
            name: template?.name || 'Service',
            description: template?.description,
            quantity: quantity,
            unitPrice: finalUnitPrice,
            discountPercent: discountPercent,
            total: finalTotal,
            frequency: svc.frequency || template?.defaultFrequency || 'MONTHLY',
            serviceTemplateId: svc.serviceId,
        };
    });
    // Calculate proposal totals
    const customSubtotal = servicesWithCustomPricing.reduce((sum, svc) => sum + svc.total, 0);
    const customVatAmount = Math.round(customSubtotal * 0.2 * 100) / 100; // 20% VAT
    const customTotal = Math.round((customSubtotal + customVatAmount) * 100) / 100;
    // Generate reference
    const reference = generateReference('PROP');
    // Set valid until (default 30 days)
    const validUntil = data.validUntil
        ? new Date(data.validUntil)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    // Create proposal with services
    logger_js_1.default.info(`Creating proposal for tenant: ${req.tenantId}, user: ${req.user.id}, client: ${data.clientId}`);
    // Parse contract start date if provided
    const contractStartDate = data.contractStartDate
        ? new Date(data.contractStartDate)
        : new Date();
    const proposal = await database_js_1.prisma.proposal.create({
        data: {
            reference,
            title: data.title,
            tenantId: req.tenantId,
            clientId: data.clientId,
            createdById: req.user.id,
            status: 'DRAFT',
            validUntil,
            contractStartDate,
            subtotal: customSubtotal,
            discountType: data.discountType,
            discountValue: data.discountValue,
            discountAmount: 0, // Line-level discounts are already applied
            vatAmount: customVatAmount,
            total: customTotal,
            paymentTerms: data.paymentTerms || '30 days',
            paymentFrequency: data.paymentFrequency || 'MONTHLY',
            coverLetter: data.coverLetter,
            terms: data.terms,
            notes: data.notes,
            services: {
                create: servicesWithCustomPricing,
            },
        },
        include: {
            client: true,
            services: true,
            createdBy: {
                select: {
                    firstName: true,
                    lastName: true,
                },
            },
        },
    });
    // Log activity
    await database_js_1.prisma.activityLog.create({
        data: {
            tenantId: req.tenantId,
            userId: req.user.id,
            action: 'PROPOSAL_CREATED',
            entityType: 'PROPOSAL',
            entityId: proposal.id,
            description: `Created proposal "${proposal.title}"`,
        },
    });
    res.status(201).json({
        success: true,
        data: proposal,
    });
}));
/**
 * PUT /api/proposals/:id
 * Update proposal
 */
router.put('/:id', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const data = updateProposalSchema.parse(req.body);
    // Check proposal exists and belongs to tenant
    const existingProposal = await database_js_1.prisma.proposal.findFirst({
        where: {
            id,
            tenantId: req.tenantId,
        },
        include: {
            client: true,
            services: true,
        },
    });
    if (!existingProposal) {
        throw new errorHandler_js_1.ApiError('NOT_FOUND', 'Proposal not found', 404);
    }
    if (existingProposal.status === 'ACCEPTED') {
        throw new errorHandler_js_1.ApiError('INVALID_STATUS', 'Cannot modify an accepted proposal', 400);
    }
    // Recalculate pricing if services changed
    let pricing = null;
    if (data.services) {
        const pricingEngine = new pricingEngine_js_1.PricingEngine(req.tenantId);
        pricing = await pricingEngine.calculateProposalPricing(data.services, {
            turnover: existingProposal.client.turnover,
            employeeCount: existingProposal.client.employeeCount,
            region: existingProposal.client.address?.country,
        }, data.discountType && data.discountValue
            ? { type: data.discountType, value: data.discountValue }
            : undefined);
    }
    // Update proposal
    const updateData = {
        title: data.title,
        validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
        paymentTerms: data.paymentTerms,
        coverLetter: data.coverLetter,
        terms: data.terms,
        notes: data.notes,
        status: data.status,
        discountType: data.discountType,
        discountValue: data.discountValue,
    };
    if (pricing) {
        updateData.subtotal = pricing.subtotal;
        updateData.discountAmount = pricing.globalDiscount;
        updateData.vatAmount = pricing.vatAmount;
        updateData.total = pricing.total;
    }
    // Remove undefined values
    Object.keys(updateData).forEach((key) => {
        if (updateData[key] === undefined) {
            delete updateData[key];
        }
    });
    const proposal = await database_js_1.prisma.proposal.update({
        where: { id },
        data: updateData,
        include: {
            client: true,
            services: true,
            createdBy: {
                select: {
                    firstName: true,
                    lastName: true,
                },
            },
        },
    });
    // Update services if provided
    if (data.services && pricing) {
        // Delete existing services
        await database_js_1.prisma.proposalService.deleteMany({
            where: { proposalId: id },
        });
        // Create new services
        await database_js_1.prisma.proposalService.createMany({
            data: pricing.services.map((svc) => ({
                proposalId: id,
                name: svc.serviceTemplate?.name || 'Service',
                description: svc.serviceTemplate?.description,
                quantity: svc.quantity,
                unitPrice: svc.basePrice,
                discountPercent: data.services.find(s => s.serviceId === svc.serviceId)?.discountPercent || 0,
                total: svc.finalPrice,
                frequency: svc.serviceTemplate?.defaultFrequency || 'MONTHLY',
                serviceTemplateId: svc.serviceId,
            })),
        });
    }
    // Log activity
    await database_js_1.prisma.activityLog.create({
        data: {
            tenantId: req.tenantId,
            userId: req.user.id,
            action: 'PROPOSAL_UPDATED',
            entityType: 'PROPOSAL',
            entityId: proposal.id,
            description: `Updated proposal "${proposal.title}"`,
        },
    });
    res.json({
        success: true,
        data: proposal,
    });
}));
/**
 * POST /api/proposals/:id/send
 * Send proposal to client via email with PDF
 */
router.post('/:id/send', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    // Get proposal with full details
    const proposal = await database_js_1.prisma.proposal.findFirst({
        where: {
            id,
            tenantId: req.tenantId,
        },
        include: {
            client: true,
            services: true,
            tenant: true,
        },
    });
    if (!proposal) {
        throw new errorHandler_js_1.ApiError('NOT_FOUND', 'Proposal not found', 404);
    }
    if (proposal.status !== 'DRAFT') {
        throw new errorHandler_js_1.ApiError('INVALID_STATUS', 'Proposal must be in draft status to send', 400);
    }
    if (!proposal.client.contactEmail) {
        throw new errorHandler_js_1.ApiError('NO_CLIENT_EMAIL', 'Client does not have an email address', 400);
    }
    // Import services
    const { EmailService } = await Promise.resolve().then(() => __importStar(require('../services/emailService.js')));
    const { PDFGenerator } = await Promise.resolve().then(() => __importStar(require('../services/pdfGenerator.js')));
    // Generate PDF
    const pdfBuffer = await PDFGenerator.generateProposal(id);
    // Initialize email service with environment variables for now
    // In production, this should come from tenant email settings
    const emailProvider = process.env.EMAIL_PROVIDER || 'smtp';
    const emailConfig = {
        provider: emailProvider,
        fromName: proposal.tenant.name,
        fromEmail: process.env.EMAIL_FROM || 'sales@capstonesoftware.co.uk',
    };
    if (emailProvider === 'smtp') {
        emailConfig.smtp = {
            host: process.env.SMTP_HOST || '',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true',
            user: process.env.SMTP_USER || '',
            pass: process.env.SMTP_PASS || '',
        };
    }
    else if (emailProvider === 'gmail') {
        emailConfig.gmail = {
            clientId: process.env.GMAIL_CLIENT_ID || '',
            clientSecret: process.env.GMAIL_CLIENT_SECRET || '',
            refreshToken: process.env.GMAIL_REFRESH_TOKEN || '',
            user: process.env.GMAIL_USER || '',
        };
    }
    else if (emailProvider === 'microsoft365') {
        emailConfig.outlook = {
            clientId: process.env.MICROSOFT_CLIENT_ID || '',
            clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
            refreshToken: process.env.MICROSOFT_REFRESH_TOKEN || '',
            user: process.env.MICROSOFT_USER || '',
        };
    }
    // Check if email is configured
    if (!emailConfig.smtp?.host && !emailConfig.gmail?.clientId && !emailConfig.outlook?.clientId) {
        // For demo/development, just mark as sent without email
        logger_js_1.default.warn('Email not configured, marking proposal as sent without email');
    }
    else {
        const emailService = new EmailService(emailConfig);
        // Build view link
        const frontendUrl = process.env.FRONTEND_URL || 'https://engagebycapstone.co.uk';
        const viewLink = `${frontendUrl}/proposals/share/${proposal.shareToken || id}`;
        // Format total amount
        const totalAmount = new Intl.NumberFormat('en-GB', {
            style: 'currency',
            currency: 'GBP',
        }).format(proposal.total);
        // Send email
        const emailResult = await emailService.sendProposalEmail({
            to: proposal.client.contactEmail,
            clientName: proposal.client.name,
            proposalTitle: proposal.title,
            proposalReference: proposal.reference,
            viewLink,
            senderName: `${req.user.firstName} ${req.user.lastName}`,
            senderPosition: req.user.role,
            senderEmail: req.user.email,
            validUntil: new Date(proposal.validUntil).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
            }),
            tenantName: proposal.tenant.name,
            totalAmount,
            serviceCount: proposal.services.length,
            attachment: pdfBuffer,
        });
        if (!emailResult.success) {
            throw new errorHandler_js_1.ApiError('EMAIL_SEND_FAILED', `Failed to send email: ${emailResult.error}`, 500);
        }
    }
    // Update status
    const updatedProposal = await database_js_1.prisma.proposal.update({
        where: { id },
        data: {
            status: 'SENT',
            sentAt: new Date(),
        },
    });
    // Log activity
    await database_js_1.prisma.activityLog.create({
        data: {
            tenantId: req.tenantId,
            userId: req.user.id,
            action: 'PROPOSAL_SENT',
            entityType: 'PROPOSAL',
            entityId: proposal.id,
            description: `Sent proposal "${proposal.title}" to ${proposal.client.name} via email`,
        },
    });
    res.json({
        success: true,
        data: updatedProposal,
        message: 'Proposal sent successfully',
    });
}));
/**
 * POST /api/proposals/:id/accept
 * Mark proposal as accepted
 */
router.post('/:id/accept', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const { acceptedBy, signature, signatoryPosition } = req.body;
    const proposal = await database_js_1.prisma.proposal.findFirst({
        where: {
            id,
            tenantId: req.tenantId,
        },
    });
    if (!proposal) {
        throw new errorHandler_js_1.ApiError('NOT_FOUND', 'Proposal not found', 404);
    }
    if (proposal.status !== 'SENT' && proposal.status !== 'VIEWED') {
        throw new errorHandler_js_1.ApiError('INVALID_STATUS', 'Proposal must be sent before accepting', 400);
    }
    // Update status
    const updatedProposal = await database_js_1.prisma.proposal.update({
        where: { id },
        data: {
            status: 'ACCEPTED',
            acceptedAt: new Date(),
            acceptedBy: acceptedBy || req.user?.firstName + ' ' + req.user?.lastName,
            signature,
            signatoryPosition,
        },
    });
    // Log activity
    await database_js_1.prisma.activityLog.create({
        data: {
            tenantId: req.tenantId,
            userId: req.user.id,
            action: 'PROPOSAL_ACCEPTED',
            entityType: 'PROPOSAL',
            entityId: proposal.id,
            description: `Proposal "${proposal.title}" was accepted`,
        },
    });
    res.json({
        success: true,
        data: updatedProposal,
    });
}));
/**
 * GET /api/proposals/:id/pdf
 * Generate proposal PDF
 */
router.get('/:id/pdf', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const proposal = await database_js_1.prisma.proposal.findFirst({
        where: {
            id,
            tenantId: req.tenantId,
        },
    });
    if (!proposal) {
        throw new errorHandler_js_1.ApiError('NOT_FOUND', 'Proposal not found', 404);
    }
    // Generate PDF
    const pdfBuffer = await pdfGenerator_js_1.PDFGenerator.generateProposal(id);
    // Set headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="proposal-${proposal.reference}.pdf"`);
    res.send(pdfBuffer);
}));
/**
 * DELETE /api/proposals/:id
 * Delete proposal
 */
router.delete('/:id', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'PARTNER', 'MANAGER'), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const proposal = await database_js_1.prisma.proposal.findFirst({
        where: {
            id,
            tenantId: req.tenantId,
        },
    });
    if (!proposal) {
        throw new errorHandler_js_1.ApiError('NOT_FOUND', 'Proposal not found', 404);
    }
    if (proposal.status === 'ACCEPTED') {
        throw new errorHandler_js_1.ApiError('INVALID_STATUS', 'Cannot delete an accepted proposal', 400);
    }
    await database_js_1.prisma.proposal.delete({
        where: { id },
    });
    // Log activity
    await database_js_1.prisma.activityLog.create({
        data: {
            tenantId: req.tenantId,
            userId: req.user.id,
            action: 'PROPOSAL_DELETED',
            entityType: 'PROPOSAL',
            entityId: proposal.id,
            description: `Deleted proposal "${proposal.title}"`,
        },
    });
    res.json({
        success: true,
        data: { message: 'Proposal deleted successfully' },
    });
}));
/**
 * POST /api/proposals/:id/view
 * Record proposal view and update status to VIEWED
 */
router.post('/:id/view', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const proposal = await database_js_1.prisma.proposal.findFirst({
        where: {
            id,
            tenantId: req.tenantId,
        },
    });
    if (!proposal) {
        throw new errorHandler_js_1.ApiError('NOT_FOUND', 'Proposal not found', 404);
    }
    // Update status to VIEWED if currently SENT
    if (proposal.status === 'SENT') {
        await database_js_1.prisma.proposal.update({
            where: { id },
            data: { status: 'VIEWED' },
        });
    }
    // Record view in activity log
    await database_js_1.prisma.activityLog.create({
        data: {
            tenantId: req.tenantId,
            userId: req.user.id,
            action: 'PROPOSAL_VIEWED',
            entityType: 'PROPOSAL',
            entityId: proposal.id,
            description: `Viewed proposal "${proposal.title}"`,
        },
    });
    res.json({
        success: true,
        data: { message: 'View recorded', status: proposal.status === 'SENT' ? 'VIEWED' : proposal.status },
    });
}));
/**
 * GET /api/proposals/:id/activity
 * Get proposal activity log
 */
router.get('/:id/activity', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const proposal = await database_js_1.prisma.proposal.findFirst({
        where: {
            id,
            tenantId: req.tenantId,
        },
    });
    if (!proposal) {
        throw new errorHandler_js_1.ApiError('NOT_FOUND', 'Proposal not found', 404);
    }
    const activities = await database_js_1.prisma.activityLog.findMany({
        where: {
            entityType: 'PROPOSAL',
            entityId: id,
            tenantId: req.tenantId,
        },
        include: {
            user: {
                select: {
                    firstName: true,
                    lastName: true,
                    email: true,
                },
            },
        },
        orderBy: { createdAt: 'desc' },
    });
    res.json({
        success: true,
        data: activities,
    });
}));
/**
 * POST /api/proposals/:id/create-renewal
 * Create a renewal proposal from an existing accepted proposal
 */
router.post('/:id/create-renewal', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    // Get the original proposal
    const originalProposal = await database_js_1.prisma.proposal.findFirst({
        where: {
            id,
            tenantId: req.tenantId,
            status: 'ACCEPTED',
        },
        include: {
            client: true,
            services: true,
        },
    });
    if (!originalProposal) {
        throw new errorHandler_js_1.ApiError('NOT_FOUND', 'Accepted proposal not found', 404);
    }
    // Generate new reference
    const reference = generateReference('PROP');
    // Set valid until (default 30 days)
    const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    // Calculate renewal date (12 months from now)
    const renewalDate = new Date();
    renewalDate.setFullYear(renewalDate.getFullYear() + 1);
    // Create renewal proposal
    const renewalProposal = await database_js_1.prisma.proposal.create({
        data: {
            reference,
            title: `${originalProposal.title} (Renewal)`,
            tenantId: req.tenantId,
            clientId: originalProposal.clientId,
            createdById: req.user.id,
            status: 'DRAFT',
            validUntil,
            subtotal: originalProposal.subtotal,
            discountType: originalProposal.discountType,
            discountValue: originalProposal.discountValue,
            discountAmount: originalProposal.discountAmount,
            vatAmount: originalProposal.vatAmount,
            total: originalProposal.total,
            paymentTerms: originalProposal.paymentTerms,
            paymentFrequency: originalProposal.paymentFrequency,
            coverLetter: originalProposal.coverLetter,
            terms: originalProposal.terms,
            notes: `Renewal of proposal ${originalProposal.reference}. ${originalProposal.notes || ''}`,
            isRenewal: true,
            originalProposalId: originalProposal.id,
            renewalDate,
            services: {
                create: originalProposal.services.map((svc) => ({
                    name: svc.name,
                    description: svc.description,
                    quantity: svc.quantity,
                    unitPrice: svc.unitPrice,
                    discountPercent: svc.discountPercent,
                    total: svc.total,
                    frequency: svc.frequency,
                    isOptional: svc.isOptional,
                    serviceTemplateId: svc.serviceTemplateId,
                })),
            },
        },
        include: {
            client: true,
            services: true,
            createdBy: {
                select: {
                    firstName: true,
                    lastName: true,
                },
            },
        },
    });
    // Log activity
    await database_js_1.prisma.activityLog.create({
        data: {
            tenantId: req.tenantId,
            userId: req.user.id,
            action: 'PROPOSAL_RENEWAL_CREATED',
            entityType: 'PROPOSAL',
            entityId: renewalProposal.id,
            description: `Created renewal proposal "${renewalProposal.title}" from ${originalProposal.reference}`,
            metadata: JSON.stringify({
                originalProposalId: originalProposal.id,
                originalReference: originalProposal.reference,
            }),
        },
    });
    res.status(201).json({
        success: true,
        data: renewalProposal,
        message: 'Renewal proposal created successfully',
    });
}));
/**
 * GET /api/proposals/stats/dashboard
 * Get dashboard statistics
 */
router.get('/stats/dashboard', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const tenantId = req.tenantId;
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    // Get monthly revenue data (accepted proposals)
    const monthlyRevenue = await database_js_1.prisma.$queryRaw `
      SELECT 
        DATE_TRUNC('month', "createdAt") as month,
        SUM(total) as revenue,
        COUNT(*) as count
      FROM "Proposal"
      WHERE "tenantId" = ${tenantId}
        AND status = 'ACCEPTED'
        AND "createdAt" >= ${sixMonthsAgo}
      GROUP BY DATE_TRUNC('month', "createdAt")
      ORDER BY month ASC
    `;
    // Format revenue data
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const revenueData = monthlyRevenue.map((row) => ({
        name: monthNames[new Date(row.month).getMonth()],
        value: Number(row.revenue) || 0,
    }));
    // Get proposal status counts
    const statusCounts = await database_js_1.prisma.proposal.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { status: true },
    });
    const statusColors = {
        DRAFT: '#9CA3AF',
        SENT: '#3B82F6',
        VIEWED: '#8B5CF6',
        ACCEPTED: '#10B981',
        DECLINED: '#EF4444',
        EXPIRED: '#6B7280',
    };
    const proposalStatusData = statusCounts.map((s) => ({
        name: s.status.charAt(0) + s.status.slice(1).toLowerCase(),
        value: s._count.status,
        color: statusColors[s.status] || '#9CA3AF',
    }));
    // Get daily activity for last 7 days
    const dailyActivity = await database_js_1.prisma.$queryRaw `
      SELECT 
        DATE("createdAt") as day,
        COUNT(*) FILTER (WHERE "entityType" = 'PROPOSAL') as proposals,
        COUNT(*) FILTER (WHERE action = 'VIEWED') as views
      FROM "ActivityLog"
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" >= ${new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)}
      GROUP BY DATE("createdAt")
      ORDER BY day ASC
    `;
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weeklyActivity = dailyActivity.map((row) => ({
        day: dayNames[new Date(row.day).getDay()],
        proposals: Number(row.proposals) || 0,
        views: Number(row.views) || 0,
    }));
    // Get recent activity
    const recentActivities = await database_js_1.prisma.activityLog.findMany({
        where: { tenantId },
        include: {
            user: {
                select: { firstName: true, lastName: true },
            },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
    });
    // Map activities to frontend format
    const activityTypeMap = {
        CREATED: { type: 'proposal_created', message: 'New proposal created', color: 'blue' },
        SENT: { type: 'proposal_sent', message: 'Proposal sent', color: 'purple' },
        VIEWED: { type: 'proposal_viewed', message: 'Proposal viewed', color: 'gray' },
        ACCEPTED: { type: 'proposal_accepted', message: 'Proposal accepted', color: 'green' },
        DECLINED: { type: 'proposal_declined', message: 'Proposal declined', color: 'red' },
    };
    const recentActivity = recentActivities.map((activity, index) => {
        const mapped = activityTypeMap[activity.action] || {
            type: 'generic',
            message: activity.description || 'Activity recorded',
            color: 'gray'
        };
        return {
            id: activity.id,
            type: mapped.type,
            message: mapped.message + (activity.entityId ? ` (${activity.entityId.slice(0, 8)})` : ''),
            time: new Date(activity.createdAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
            }),
            color: mapped.color,
        };
    });
    res.json({
        success: true,
        data: {
            revenueData,
            proposalStatusData,
            weeklyActivity,
            recentActivity,
        },
    });
}));
exports.default = router;
//# sourceMappingURL=proposals.js.map