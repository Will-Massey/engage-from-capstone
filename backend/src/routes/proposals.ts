import { Router } from 'express';
import { z } from 'zod';
import { ProposalStatus, PricingFrequency } from '@prisma/client';
import { prisma } from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { PricingEngine } from '../services/pricingEngine.js';
import { PDFGenerator } from '../services/pdfGenerator.js';
import logger from '../config/logger.js';
// generateReference helper function
const generateReference = (prefix: string = 'PROP'): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

const router = Router();

// Validation schemas
const createProposalSchema = z.object({
  clientId: z.string(),
  title: z.string().min(1, 'Title is required'),
  templateId: z.string().optional(),
  services: z.array(z.object({
    serviceId: z.string(),
    quantity: z.number().min(1).default(1),
    discountPercent: z.number().min(0).max(100).optional(),
  })).min(1, 'At least one service is required'),
  validUntil: z.string().datetime().optional(),
  paymentTerms: z.string().optional(),
  paymentFrequency: z.nativeEnum(PricingFrequency).optional(),
  coverLetter: z.string().optional(),
  terms: z.string().optional(),
  notes: z.string().optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED']).optional(),
  discountValue: z.number().min(0).optional(),
});

const updateProposalSchema = z.object({
  title: z.string().min(1).optional(),
  services: z.array(z.object({
    serviceId: z.string(),
    quantity: z.number().min(1),
    discountPercent: z.number().min(0).max(100).optional(),
  })).optional(),
  validUntil: z.string().datetime().optional(),
  paymentTerms: z.string().optional(),
  coverLetter: z.string().optional(),
  terms: z.string().optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(ProposalStatus).optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED']).optional(),
  discountValue: z.number().min(0).optional(),
});

/**
 * GET /api/proposals
 * List proposals for tenant
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const { status, clientId, search, page = '1', limit = '20' } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    // Build where clause
    const where: any = {
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
        { title: { contains: search as string, mode: 'insensitive' } },
        { reference: { contains: search as string, mode: 'insensitive' } },
        { client: { name: { contains: search as string, mode: 'insensitive' } } },
      ];
    }

    // Get proposals with count
    const [proposals, total] = await Promise.all([
      prisma.proposal.findMany({
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
            select: { services: true },
          },
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.proposal.count({ where }),
    ]);

    res.json({
      success: true,
      data: proposals,
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
 * GET /api/proposals/:id
 * Get single proposal
 */
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const proposal = await prisma.proposal.findFirst({
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
      throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
    }

    res.json({
      success: true,
      data: proposal,
    });
  })
);

/**
 * POST /api/proposals
 * Create new proposal
 */
router.post(
  '/',
  authenticate,
  authorize('PARTNER', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const data = createProposalSchema.parse(req.body);

    // Get client
    const client = await prisma.client.findFirst({
      where: {
        id: data.clientId,
        tenantId: req.tenantId,
      },
    });

    if (!client) {
      throw new ApiError('CLIENT_NOT_FOUND', 'Client not found', 404);
    }

    // Calculate pricing
    const pricingEngine = new PricingEngine(req.tenantId);
    const pricing = await pricingEngine.calculateProposalPricing(
      data.services,
      {
        turnover: client.turnover,
        employeeCount: client.employeeCount,
        region: client.address?.country,
      },
      data.discountType && data.discountValue
        ? { type: data.discountType, value: data.discountValue }
        : undefined
    );

    // Generate reference
    const reference = generateReference('PROP');

    // Set valid until (default 30 days)
    const validUntil = data.validUntil
      ? new Date(data.validUntil)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Create proposal with services
    const proposal = await prisma.proposal.create({
      data: {
        reference,
        title: data.title,
        tenantId: req.tenantId,
        clientId: data.clientId,
        createdById: req.user!.id,
        status: 'DRAFT',
        validUntil,
        subtotal: pricing.subtotal,
        discountType: data.discountType,
        discountValue: data.discountValue,
        discountAmount: pricing.globalDiscount,
        vatAmount: pricing.vatAmount,
        total: pricing.total,
        paymentTerms: data.paymentTerms || '30 days',
        paymentFrequency: data.paymentFrequency || 'MONTHLY',
        coverLetter: data.coverLetter,
        terms: data.terms,
        notes: data.notes,
        services: {
          create: pricing.services.map((svc) => ({
            name: svc.serviceTemplate?.name || 'Service',
            description: svc.serviceTemplate?.description,
            quantity: svc.quantity,
            unitPrice: svc.basePrice,
            discountPercent: data.services.find(s => s.serviceId === svc.serviceId)?.discountPercent || 0,
            total: svc.finalPrice,
            frequency: svc.serviceTemplate?.defaultFrequency || 'MONTHLY',
            serviceTemplateId: svc.serviceId,
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
    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user!.id,
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
  })
);

/**
 * PUT /api/proposals/:id
 * Update proposal
 */
router.put(
  '/:id',
  authenticate,
  authorize('PARTNER', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = updateProposalSchema.parse(req.body);

    // Check proposal exists and belongs to tenant
    const existingProposal = await prisma.proposal.findFirst({
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
      throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
    }

    if (existingProposal.status === 'ACCEPTED') {
      throw new ApiError('INVALID_STATUS', 'Cannot modify an accepted proposal', 400);
    }

    // Recalculate pricing if services changed
    let pricing = null;
    if (data.services) {
      const pricingEngine = new PricingEngine(req.tenantId);
      pricing = await pricingEngine.calculateProposalPricing(
        data.services,
        {
          turnover: existingProposal.client.turnover,
          employeeCount: existingProposal.client.employeeCount,
          region: existingProposal.client.address?.country,
        },
        data.discountType && data.discountValue
          ? { type: data.discountType, value: data.discountValue }
          : undefined
      );
    }

    // Update proposal
    const updateData: any = {
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

    const proposal = await prisma.proposal.update({
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
      await prisma.proposalService.deleteMany({
        where: { proposalId: id },
      });

      // Create new services
      await prisma.proposalService.createMany({
        data: pricing.services.map((svc) => ({
          proposalId: id,
          name: svc.serviceTemplate?.name || 'Service',
          description: svc.serviceTemplate?.description,
          quantity: svc.quantity,
          unitPrice: svc.basePrice,
          discountPercent: data.services!.find(s => s.serviceId === svc.serviceId)?.discountPercent || 0,
          total: svc.finalPrice,
          frequency: svc.serviceTemplate?.defaultFrequency || 'MONTHLY',
          serviceTemplateId: svc.serviceId,
        })),
      });
    }

    // Log activity
    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user!.id,
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
  })
);

/**
 * POST /api/proposals/:id/send
 * Send proposal to client via email with PDF
 */
router.post(
  '/:id/send',
  authenticate,
  authorize('PARTNER', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Get proposal with full details
    const proposal = await prisma.proposal.findFirst({
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
      throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
    }

    if (proposal.status !== 'DRAFT' && proposal.status !== 'PENDING_REVIEW') {
      throw new ApiError('INVALID_STATUS', 'Proposal must be in draft status to send', 400);
    }

    if (!proposal.client.contactEmail) {
      throw new ApiError('NO_CLIENT_EMAIL', 'Client does not have an email address', 400);
    }

    // Import services
    const { EmailService } = await import('../services/emailService.js');
    const { PDFGenerator } = await import('../services/pdfGenerator.js');

    // Generate PDF
    const pdfBuffer = await PDFGenerator.generateProposal(id);

    // Initialize email service with environment variables for now
    // In production, this should come from tenant email settings
    const emailProvider = process.env.EMAIL_PROVIDER as any || 'smtp';
    const emailConfig: any = {
      provider: emailProvider,
      fromName: proposal.tenant.name,
      fromEmail: process.env.EMAIL_FROM || 'noreply@engagebycapstone.co.uk',
    };

    if (emailProvider === 'smtp') {
      emailConfig.smtp = {
        host: process.env.SMTP_HOST || '',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      };
    } else if (emailProvider === 'gmail') {
      emailConfig.gmail = {
        clientId: process.env.GMAIL_CLIENT_ID || '',
        clientSecret: process.env.GMAIL_CLIENT_SECRET || '',
        refreshToken: process.env.GMAIL_REFRESH_TOKEN || '',
        user: process.env.GMAIL_USER || '',
      };
    } else if (emailProvider === 'microsoft365') {
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
      logger.warn('Email not configured, marking proposal as sent without email');
    } else {
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
        senderName: `${req.user!.firstName} ${req.user!.lastName}`,
        senderPosition: req.user!.role,
        senderEmail: req.user!.email,
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
        throw new ApiError('EMAIL_SEND_FAILED', `Failed to send email: ${emailResult.error}`, 500);
      }
    }

    // Update status
    const updatedProposal = await prisma.proposal.update({
      where: { id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user!.id,
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
  })
);

/**
 * POST /api/proposals/:id/accept
 * Mark proposal as accepted
 */
router.post(
  '/:id/accept',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { acceptedBy, signature } = req.body;

    const proposal = await prisma.proposal.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!proposal) {
      throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
    }

    if (proposal.status !== 'SENT' && proposal.status !== 'VIEWED') {
      throw new ApiError('INVALID_STATUS', 'Proposal must be sent before accepting', 400);
    }

    // Update status
    const updatedProposal = await prisma.proposal.update({
      where: { id },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        acceptedBy: acceptedBy || req.user?.firstName + ' ' + req.user?.lastName,
        signature,
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user!.id,
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
  })
);

/**
 * GET /api/proposals/:id/pdf
 * Generate proposal PDF
 */
router.get(
  '/:id/pdf',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const proposal = await prisma.proposal.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!proposal) {
      throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
    }

    // Generate PDF
    const pdfBuffer = await PDFGenerator.generateProposal(id);

    // Set headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="proposal-${proposal.reference}.pdf"`);
    res.send(pdfBuffer);
  })
);

/**
 * DELETE /api/proposals/:id
 * Delete proposal
 */
router.delete(
  '/:id',
  authenticate,
  authorize('PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const proposal = await prisma.proposal.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!proposal) {
      throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
    }

    if (proposal.status === 'ACCEPTED') {
      throw new ApiError('INVALID_STATUS', 'Cannot delete an accepted proposal', 400);
    }

    await prisma.proposal.delete({
      where: { id },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user!.id,
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
  })
);

export default router;
