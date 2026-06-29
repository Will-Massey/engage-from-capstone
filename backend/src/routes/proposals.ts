import { Router } from 'express';
import { z } from 'zod';
import { ProposalStatus, PricingFrequency } from '@prisma/client';
import { prisma } from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { PDFGenerator } from '../services/pdfGenerator.js';
import logger from '../config/logger.js';
import { getProposalViewStats, createShareableLink } from '../services/proposalSharingService.js';
import {
  buildProposalServiceRecord,
  calculateHeaderTotals,
} from '../utils/proposalPricing.js';
import {
  addDays,
  getProposalSettings,
  parseProposalDateInput,
} from '../utils/tenantProposalSettings.js';
// generateReference helper function
const generateReference = (prefix: string = 'PROP'): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

/** YYYY-MM-DD or ISO datetime; only stored for ONE_TIME lines */
function parseOneOffDueDate(billingFrequency: string, raw: unknown): Date | null {
  if (billingFrequency !== 'ONE_TIME') return null;
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00.000Z`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const router = Router();

// Validation schemas
const createProposalSchema = z.object({
  clientId: z.string(),
  title: z.string().min(1, 'Title is required'),
  templateId: z.string().optional(),
  services: z
    .array(
      z.object({
        serviceId: z.string(),
        quantity: z.number().min(1).default(1),
        unitPrice: z.number().min(0).optional(), // Allow custom unit price
        discountPercent: z.number().min(0).max(100).optional(),
        frequency: z.nativeEnum(PricingFrequency).optional(), // Billing frequency per service
        billingFrequency: z.nativeEnum(PricingFrequency).optional(), // Frontend sends this
        displayPrice: z.number().min(0).optional(), // Custom price from frontend
        vatRate: z.number().min(0).max(100).optional(), // Per-line VAT rate
        oneOffDueDate: z.union([z.string(), z.null()]).optional(),
      })
    )
    .min(1, 'At least one service is required'),
  validUntil: z.union([z.string().datetime(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  contractStartDate: z
    .union([z.string().datetime(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
    .optional(),
  paymentTerms: z.string().optional(),
  paymentFrequency: z.nativeEnum(PricingFrequency).optional(),
  coverLetter: z.string().optional(),
  engagementLetter: z.string().optional(),
  terms: z.string().optional(),
  notes: z.string().optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED']).optional(),
  discountValue: z.number().min(0).optional(),
});

const updateProposalSchema = z.object({
  title: z.string().min(1).optional(),
  services: z
    .array(
      z.object({
        serviceId: z.string(),
        quantity: z.number().min(1),
        discountPercent: z.number().min(0).max(100).optional(),
        // v2 pricing fields
        vatRate: z.number().min(0).max(100).optional(),
        billingFrequency: z
          .enum(['ONE_TIME', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY'])
          .optional(),
        displayPrice: z.number().min(0).optional(),
        oneOffDueDate: z.union([z.string(), z.null()]).optional(),
      })
    )
    .optional(),
  validUntil: z.union([z.string().datetime(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  contractStartDate: z
    .union([z.string().datetime(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
    .optional(),
  paymentTerms: z.string().optional(),
  coverLetter: z.string().optional(),
  engagementLetter: z.string().optional(),
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

    logger.info(`Fetching proposals for tenant: ${req.tenantId}, user: ${req.user?.id}`);

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
            select: { services: true, views: true },
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
        signatures: {
          orderBy: { signedAt: 'desc' },
          take: 5,
        },
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

    const viewStats = await getProposalViewStats(id);

    res.json({
      success: true,
      data: {
        ...proposal,
        viewCount: viewStats?.totalViews ?? 0,
        lastViewedAt: viewStats?.lastViewedAt ?? null,
      },
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
  authorize('PARTNER', 'MANAGER', 'SENIOR', 'ADMIN'),
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

    // Fetch service templates for frequency and name info (tenant-scoped)
    const requestedIds = data.services.map((s: any) => s.serviceId);
    const serviceTemplates = await prisma.serviceTemplate.findMany({
      where: {
        id: { in: requestedIds },
        tenantId: req.tenantId,
      },
    });

    if (serviceTemplates.length !== requestedIds.length) {
      throw new ApiError(
        'INVALID_SERVICES',
        'One or more services are invalid or belong to another practice',
        400
      );
    }

    const servicesWithClearPricing = data.services.map((svc: any) => {
      const template = serviceTemplates.find((t) => t.id === svc.serviceId);
      return buildProposalServiceRecord(svc, template, parseOneOffDueDate);
    });

    const tenantRecord = await prisma.tenant.findUnique({
      where: { id: req.tenantId },
      select: { settings: true },
    });
    const proposalSettings = getProposalSettings(tenantRecord?.settings);

    const { subtotal, vatAmount: totalVat, total: grandTotal } =
      calculateHeaderTotals(servicesWithClearPricing);

    // Generate reference
    const reference = generateReference('PROP');

    const parsedValidUntil = parseProposalDateInput(data.validUntil);
    const validUntil =
      parsedValidUntil && parsedValidUntil !== null
        ? parsedValidUntil
        : addDays(new Date(), proposalSettings.defaultExpiryDays);

    const contractStartDate =
      data.contractStartDate !== undefined
        ? parseProposalDateInput(data.contractStartDate)
        : null;

    logger.info(
      `Creating proposal for tenant: ${req.tenantId}, user: ${req.user!.id}, client: ${data.clientId}`
    );

    const proposal = await prisma.proposal.create({
      data: {
        reference,
        title: data.title,
        tenantId: req.tenantId,
        clientId: data.clientId,
        createdById: req.user!.id,
        status: 'DRAFT',
        validUntil,
        contractStartDate,
        subtotal,
        discountType: data.discountType,
        discountValue: data.discountValue,
        discountAmount: 0, // Line-level discounts are already applied
        vatRate: 20, // Default VAT rate
        vatAmount: totalVat,
        total: grandTotal,
        paymentTerms: data.paymentTerms || '30 days',
        paymentFrequency: data.paymentFrequency || 'MONTHLY',
        coverLetter: data.coverLetter,
        engagementLetter: data.engagementLetter,
        terms: data.terms,
        notes: data.notes,
        services: {
          create: servicesWithClearPricing as any,
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
  authorize('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'),
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

    // Update proposal
    const updateData: any = {
      title: data.title,
      paymentTerms: data.paymentTerms,
      coverLetter: data.coverLetter,
      engagementLetter: data.engagementLetter,
      terms: data.terms,
      notes: data.notes,
      status: data.status,
      discountType: data.discountType,
      discountValue: data.discountValue,
    };

    if (data.validUntil !== undefined) {
      const parsed = parseProposalDateInput(data.validUntil);
      if (parsed) updateData.validUntil = parsed;
    }

    if (data.contractStartDate !== undefined) {
      updateData.contractStartDate = parseProposalDateInput(data.contractStartDate);
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
    if (data.services) {
      // Delete existing services
      await prisma.proposalService.deleteMany({
        where: { proposalId: id },
      });

      // Fetch service templates for the new services
      const serviceTemplateIds = data.services.map((s) => s.serviceId);
      const serviceTemplates = await prisma.serviceTemplate.findMany({
        where: {
          id: { in: serviceTemplateIds },
          tenantId: req.tenantId,
        },
      });

      const built = data.services.map((svc) => {
        const template = serviceTemplates.find((t) => t.id === svc.serviceId);
        return buildProposalServiceRecord(
          { ...svc, serviceId: svc.serviceId },
          template,
          parseOneOffDueDate
        );
      });

      const servicesToCreate = built.map((line) => ({
        proposalId: id,
        ...line,
      }));

      await prisma.proposalService.createMany({
        data: servicesToCreate as any,
      });

      const totals = calculateHeaderTotals(built);

      await prisma.proposal.update({
        where: { id },
        data: {
          subtotal: totals.subtotal,
          vatAmount: totals.vatAmount,
          total: totals.total,
        },
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
  authorize('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const sendBody = z
      .object({
        aiSubject: z.string().max(200).optional(),
        aiText: z.string().max(50_000).optional(),
        aiHtml: z.string().max(100_000).optional(),
      })
      .parse(req.body ?? {});

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

    if (proposal.status !== 'DRAFT') {
      throw new ApiError('INVALID_STATUS', 'Proposal must be in draft status to send', 400);
    }

    if (!proposal.client.contactEmail) {
      throw new ApiError('NO_CLIENT_EMAIL', 'Client does not have an email address', 400);
    }

    const tenantSubdomain = proposal.tenant.subdomain;

    const { PDFGenerator } = await import('../services/pdfGenerator.js');
    const { tenantMailer } = await import('../services/tenantMailer.js');
    const { createShareableLink } = await import('../services/proposalSharingService.js');

    const pdfBuffer = await PDFGenerator.generateProposal(id);

    const frontendUrl = (process.env.FRONTEND_URL || 'https://engagebycapstone.co.uk').replace(
      /\/$/,
      ''
    );
    let viewToken = proposal.shareToken;
    const tokenExpiry = proposal.shareTokenExpiry;
    if (
      !viewToken ||
      !tokenExpiry ||
      new Date(tokenExpiry).getTime() < Date.now() ||
      !proposal.publicAccessEnabled
    ) {
      const link = await createShareableLink(id, 30, tenantSubdomain);
      viewToken = link.token;
    }
    const viewLink = `${frontendUrl}/proposals/view/${viewToken}`;

    const totalAmount = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
    }).format(proposal.total);

    const emailResult = await tenantMailer.sendProposalEmail(
      req.tenantId!,
      {
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
        aiSubject: sendBody.aiSubject,
        aiText: sendBody.aiText,
        aiHtml: sendBody.aiHtml,
      },
      { proposalId: id, clientId: proposal.clientId }
    );

    if (!emailResult.success) {
      throw new ApiError('EMAIL_SEND_FAILED', `Failed to send email: ${emailResult.error}`, 500);
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
    const { acceptedBy, signature, signatoryPosition, deviceInfo } = req.body;

    const proposal = await prisma.proposal.findFirst({
      where: { id, tenantId: req.tenantId },
      include: { services: true },
    });

    if (!proposal) {
      throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
    }

    if (proposal.status !== 'SENT' && proposal.status !== 'VIEWED') {
      throw new ApiError('INVALID_STATUS', 'Proposal must be sent before accepting', 400);
    }

    const signerName =
      acceptedBy || `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim();

    if (!signature || String(signature).length < 100) {
      throw new ApiError('SIGNATURE_REQUIRED', 'Electronic signature is required', 400);
    }

    const { recordElectronicSignature } = await import('../services/proposalSharingService.js');
    const {
      AGREEMENT_VERSION,
      DEFAULT_CONSENT_TEXT,
      hashProposalDocument,
      hashTerms,
      lookupGeoFromIp,
    } = await import('../utils/signatureAudit.js');

    const ipAddress = req.ip || null;
    const result = await recordElectronicSignature({
      proposalId: proposal.id,
      signedBy: signerName,
      signedByRole: signatoryPosition || 'Authorised signatory',
      signerEmail: req.user?.email || null,
      signatureData: signature,
      ipAddress,
      userAgent: req.headers['user-agent'] || null,
      deviceInfo: deviceInfo || null,
      geoLocation: await lookupGeoFromIp(ipAddress),
      documentHash: hashProposalDocument(proposal),
      termsHash: hashTerms(proposal.terms),
      consentText: DEFAULT_CONSENT_TEXT,
      signatureType: 'SIMPLE_ELECTRONIC',
      agreementVersion: AGREEMENT_VERSION,
      tenantId: req.tenantId!,
      userId: req.user!.id,
    });

    if (!result.success) {
      throw new ApiError('SIGNATURE_FAILED', result.error || 'Failed to record signature', 500);
    }

    const updatedProposal = await prisma.proposal.findFirst({
      where: { id, tenantId: req.tenantId },
      include: { client: true, services: true },
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
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="proposal-${proposal.reference}.pdf"`
    );
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
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
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

/**
 * POST /api/proposals/:id/view
 * Record proposal view and update status to VIEWED
 */
router.post(
  '/:id/view',
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

    // Client opens are tracked via GET /api/proposals/view/:token (ProposalView rows).
    // Staff opening this page must not change SENT → VIEWED or inflate client metrics.
    res.json({
      success: true,
      data: {
        message: 'OK',
        status: proposal.status,
      },
    });
  })
);

/**
 * GET /api/proposals/:id/activity
 * Get proposal activity log
 */
router.get(
  '/:id/activity',
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

    const activities = await prisma.activityLog.findMany({
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
  })
);

/**
 * POST /api/proposals/:id/create-renewal
 * Create a renewal proposal from an existing accepted proposal
 */
router.post(
  '/:id/create-renewal',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Get the original proposal
    const originalProposal = await prisma.proposal.findFirst({
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
      throw new ApiError('NOT_FOUND', 'Accepted proposal not found', 404);
    }

    // Generate new reference
    const reference = generateReference('PROP');

    // Set valid until (default 30 days)
    const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Calculate renewal date (12 months from now)
    const renewalDate = new Date();
    renewalDate.setFullYear(renewalDate.getFullYear() + 1);

    // Create renewal proposal
    const renewalProposal = await prisma.proposal.create({
      data: {
        reference,
        title: `${originalProposal.title} (Renewal)`,
        tenantId: req.tenantId,
        clientId: originalProposal.clientId,
        createdById: req.user!.id,
        status: 'DRAFT',
        validUntil,
        subtotal: originalProposal.subtotal,
        discountType: originalProposal.discountType,
        discountValue: originalProposal.discountValue,
        discountAmount: originalProposal.discountAmount,
        // vatAmount: originalProposal.vatAmount, // Temporarily disabled
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
            displayPrice: svc.displayPrice,
            lineTotal: svc.lineTotal,
            billingFrequency: svc.billingFrequency,
            priceDisplayMode: svc.priceDisplayMode,
            frequency: svc.frequency,
            isOptional: svc.isOptional,
            serviceTemplateId: svc.serviceTemplateId,
          })) as any,
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
  })
);

/**
 * GET /api/proposals/stats/dashboard
 * Get dashboard statistics
 */
router.get(
  '/stats/dashboard',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get monthly revenue data (accepted proposals)
    const monthlyRevenue = (await prisma.$queryRaw`
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
    `) as any[];

    // Format revenue data
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const revenueData = monthlyRevenue.map((row: any) => ({
      name: monthNames[new Date(row.month).getMonth()],
      value: Number(row.revenue) || 0,
    }));

    // Get proposal status counts
    const statusCounts = await prisma.proposal.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: { status: true },
    });

    const statusColors: Record<string, string> = {
      DRAFT: '#9CA3AF',
      SENT: '#3B82F6',
      VIEWED: '#8B5CF6',
      ACCEPTED: '#10B981',
      DECLINED: '#EF4444',
      EXPIRED: '#6B7280',
    };

    const proposalStatusData = statusCounts.map((s: any) => ({
      name: s.status.charAt(0) + s.status.slice(1).toLowerCase(),
      value: s._count.status,
      color: statusColors[s.status] || '#9CA3AF',
    }));

    // Get daily activity for last 7 days
    const dailyActivity = (await prisma.$queryRaw`
      SELECT 
        DATE("createdAt") as day,
        COUNT(*) FILTER (WHERE "entityType" = 'PROPOSAL') as proposals,
        COUNT(*) FILTER (WHERE action = 'VIEWED') as views
      FROM "ActivityLog"
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" >= ${new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)}
      GROUP BY DATE("createdAt")
      ORDER BY day ASC
    `) as any[];

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weeklyActivity = dailyActivity.map((row: any) => ({
      day: dayNames[new Date(row.day).getDay()],
      proposals: Number(row.proposals) || 0,
      views: Number(row.views) || 0,
    }));

    // Get recent activity
    const recentActivities = await prisma.activityLog.findMany({
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
    const activityTypeMap: Record<string, { type: string; message: string; color: string }> = {
      CREATED: { type: 'proposal_created', message: 'New proposal created', color: 'blue' },
      SENT: { type: 'proposal_sent', message: 'Proposal sent', color: 'purple' },
      VIEWED: { type: 'proposal_viewed', message: 'Proposal viewed', color: 'gray' },
      ACCEPTED: { type: 'proposal_accepted', message: 'Proposal accepted', color: 'green' },
      DECLINED: { type: 'proposal_declined', message: 'Proposal declined', color: 'red' },
    };

    const recentActivity = recentActivities.map((activity: any, index: number) => {
      const mapped = activityTypeMap[activity.action] || {
        type: 'generic',
        message: activity.description || 'Activity recorded',
        color: 'gray',
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
  })
);

export default router;
