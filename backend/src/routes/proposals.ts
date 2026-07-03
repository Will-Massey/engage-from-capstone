import { Router } from 'express';
import { z } from 'zod';
import { ApprovalStatus, ProposalStatus, PricingFrequency, UserRole } from '@prisma/client';
import { prisma } from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { enforceTierLimit } from '../middleware/tierLimits.js';
import { PDFGenerator } from '../services/pdfGenerator.js';
import logger from '../config/logger.js';
import {
  getProposalViewStats,
  createShareableLink,
  revokeShareableLink,
} from '../services/proposalSharingService.js';
import {
  buildProposalServiceRecord,
  calculateHeaderTotals,
} from '../utils/proposalPricing.js';
import { serializeProposalServicesForApi } from '../utils/proposalServiceSnapshot.js';
import {
  mergeProposalCustomFields,
  parseProposalCustomFields,
  serializeProposalCustomFields,
} from '../utils/proposalCustomFields.js';
import { formatUserRole } from '../utils/proposalDisplay.js';
import {
  addDays,
  formatPaymentTerms,
  getProposalSettings,
  parseProposalDateInput,
} from '../utils/tenantProposalSettings.js';
import { getProposalRegulatoryFit } from '../services/regulatoryFitService.js';
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

const APPROVER_ROLES: UserRole[] = ['ADMIN', 'PARTNER', 'MD', 'MANAGER'];
const PARTNER_OVERRIDE_ROLES: UserRole[] = ['ADMIN', 'PARTNER', 'MD'];
const SUBMITTER_ROLES: UserRole[] = ['JUNIOR', 'SENIOR'];

function canOverrideApproval(role: UserRole): boolean {
  return PARTNER_OVERRIDE_ROLES.includes(role);
}

function canSendProposal(role: UserRole, approvalStatus: ApprovalStatus): boolean {
  if (canOverrideApproval(role)) {
    return true;
  }
  return approvalStatus === 'APPROVED';
}

async function resolveSenderPosition(userId: string, role: UserRole): Promise<string | undefined> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { jobTitle: true, role: true },
  });
  return user?.jobTitle?.trim() || formatUserRole(user?.role || role);
}

const proposalApprovalInclude = {
  approvedBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
} as const;

const pricingTierSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  feeMultiplier: z.number().min(0).optional(),
  serviceLineIds: z.array(z.string()).optional(),
});

const proposalCustomFieldsSchema = z
  .object({
    offerThreePackages: z.boolean().optional(),
    pricingTiers: z.array(pricingTierSchema).optional(),
    requiredSigners: z.union([z.literal(1), z.literal(2)]).optional(),
  })
  .optional();

// Validation schemas
const createProposalSchema = z.object({
  clientId: z.string(),
  title: z.string().min(1, 'Title is required'),
  templateId: z.string().optional(),
  services: z
    .array(
      z.object({
        serviceId: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
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
  proposalSummary: z.string().max(4000).optional(),
  engagementLetter: z.string().optional(),
  terms: z.string().optional(),
  notes: z.string().optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED']).optional(),
  discountValue: z.number().min(0).optional(),
  customFields: proposalCustomFieldsSchema,
});

const updateProposalSchema = z.object({
  title: z.string().min(1).optional(),
  services: z
    .array(
      z.object({
        serviceId: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
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
  proposalSummary: z.string().max(4000).optional(),
  engagementLetter: z.string().optional(),
  terms: z.string().optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(ProposalStatus).optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED']).optional(),
  discountValue: z.number().min(0).optional(),
  customFields: proposalCustomFieldsSchema,
});

/**
 * GET /api/proposals
 * List proposals for tenant
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const { status, approvalStatus, clientId, search, page = '1', limit = '20' } = req.query;

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

    if (approvalStatus) {
      where.approvalStatus = approvalStatus;
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
          approvedBy: {
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
 * GET /api/proposals/approval-queue
 * List proposals awaiting partner approval (for approvers)
 */
router.get(
  '/approval-queue',
  authenticate,
  authorize(...APPROVER_ROLES),
  asyncHandler(async (req, res) => {
    const { page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const where = {
      tenantId: req.tenantId,
      approvalStatus: 'PENDING' as ApprovalStatus,
      status: 'DRAFT' as ProposalStatus,
    };

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
              email: true,
            },
          },
          _count: {
            select: { services: true },
          },
        },
        skip,
        take,
        orderBy: { submittedForApprovalAt: 'asc' },
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
 * GET /api/proposals/renewal-candidates
 * List accepted contracts due for renewal (bulk renewal wizard step 1)
 */
router.get(
  '/renewal-candidates',
  authenticate,
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        expiringBefore: z
          .union([z.string().datetime(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
          .optional(),
        clientIds: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .transform((val) => {
            if (!val) return undefined;
            const ids = Array.isArray(val) ? val : val.split(',').map((s) => s.trim());
            return ids.filter(Boolean);
          }),
      })
      .parse(req.query);

    const { findRenewalCandidates, parseExpiringBeforeInput } = await import(
      '../services/renewalProposalService.js'
    );

    const expiringBefore = query.expiringBefore
      ? parseExpiringBeforeInput(query.expiringBefore)
      : undefined;

    const candidates = await findRenewalCandidates({
      tenantId: req.tenantId!,
      expiringBefore,
      clientIds: query.clientIds,
    });

    res.json({
      success: true,
      data: candidates,
      meta: {
        count: candidates.length,
        expiringBefore: expiringBefore?.toISOString() ?? null,
        eligible: candidates.filter((c) => !c.hasPendingRenewal).length,
      },
    });
  })
);

/**
 * POST /api/proposals/bulk-renewal
 * Batch-create DRAFT renewal proposals (does not send)
 */
router.post(
  '/bulk-renewal',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const upliftRulesSchema = z.object({
      mode: z.enum(['percent', 'cpi', 'min_floor']),
      percent: z.number().min(-50).max(50).optional(),
      cpiPercent: z.number().min(0).max(50).optional(),
      minFeeGbp: z.number().min(0).optional(),
      perServiceFloors: z.record(z.string(), z.number().min(0)).optional(),
    });

    const body = z
      .object({
        clientIds: z.array(z.string().uuid()).optional(),
        proposalIds: z.array(z.string().uuid()).optional(),
        expiringBefore: z
          .union([z.string().datetime(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
          .optional(),
        templateId: z.string().uuid().optional(),
        upliftPercent: z.number().min(-50).max(50).optional(),
        upliftRules: upliftRulesSchema.optional(),
        useAiCoverLetter: z.boolean().default(false),
      })
      .parse(req.body);

    if (
      !body.clientIds?.length &&
      !body.proposalIds?.length &&
      !body.expiringBefore
    ) {
      throw new ApiError(
        'INVALID_REQUEST',
        'Provide clientIds, proposalIds, or expiringBefore',
        400
      );
    }

    const { bulkCreateRenewalDrafts, parseExpiringBeforeInput } = await import(
      '../services/renewalProposalService.js'
    );

    const result = await bulkCreateRenewalDrafts({
      tenantId: req.tenantId!,
      userId: req.user!.id,
      clientIds: body.clientIds,
      proposalIds: body.proposalIds,
      expiringBefore: body.expiringBefore
        ? parseExpiringBeforeInput(body.expiringBefore)
        : undefined,
      templateId: body.templateId,
      upliftPercent: body.upliftPercent,
      upliftRules: body.upliftRules as UpliftRules | undefined,
      useAiCoverLetter: body.useAiCoverLetter,
    });

    res.status(result.summary.created > 0 ? 201 : 200).json({
      success: true,
      data: result,
      message:
        result.summary.created > 0
          ? `Created ${result.summary.created} renewal draft${result.summary.created === 1 ? '' : 's'}`
          : 'No renewal drafts were created',
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
            serviceTemplate: { select: { id: true, category: true } },
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
        ...proposalApprovalInclude,
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
        services: serializeProposalServicesForApi(proposal.services as any),
        viewCount: viewStats?.totalViews ?? 0,
        lastViewedAt: viewStats?.lastViewedAt ?? null,
      },
    });
  })
);

/**
 * GET /api/proposals/:id/regulatory-fit
 * Rule-based MTD / AML regulatory fit for a proposal
 */
router.get(
  '/:id/regulatory-fit',
  authenticate,
  authorize('PARTNER', 'MANAGER', 'SENIOR', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const data = await getProposalRegulatoryFit(req.tenantId!, req.params.id);
    if (!data) {
      throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
    }
    res.json({ success: true, data });
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
  enforceTierLimit('proposals'),
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
        paymentTerms:
          data.paymentTerms ||
          formatPaymentTerms(proposalSettings.defaultPaymentTermsDays),
        paymentFrequency: data.paymentFrequency || 'MONTHLY',
        coverLetter: data.coverLetter,
        proposalSummary: data.proposalSummary,
        engagementLetter: data.engagementLetter,
        terms:
          data.terms?.trim() ||
          (await resolveProposalTerms(
            req.tenantId!,
            serviceTemplates.map((t) => ({ name: t.name, tags: t.tags }))
          )),
        notes: data.notes,
        customFields: data.customFields
          ? serializeProposalCustomFields(data.customFields as import('../utils/proposalCustomFields.js').ProposalCustomFields)
          : '{}',
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
      data: {
        ...proposal,
        services: serializeProposalServicesForApi(proposal.services as any),
      },
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
      proposalSummary: data.proposalSummary,
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

    if (data.customFields !== undefined) {
      const existingFields = parseProposalCustomFields(existingProposal.customFields);
      const incoming = data.customFields as import('../utils/proposalCustomFields.js').ProposalCustomFields;
      const { selectedTierId: _st, selectedTierLabel: _stl, signaturesReceived: _sr, ...builderFields } =
        incoming;
      const merged = mergeProposalCustomFields(existingFields, builderFields);
      updateData.customFields = serializeProposalCustomFields(merged);
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
      const serviceTemplateIds = data.services.map((s) => s.serviceId);
      const serviceTemplates = await prisma.serviceTemplate.findMany({
        where: {
          id: { in: serviceTemplateIds },
          tenantId: req.tenantId,
        },
      });

      if (serviceTemplates.length !== serviceTemplateIds.length) {
        throw new ApiError(
          'INVALID_SERVICES',
          'One or more services are invalid or belong to another practice',
          400
        );
      }

      const existingByTemplateId = new Map(
        existingProposal.services
          .filter((s) => s.serviceTemplateId)
          .map((s) => [s.serviceTemplateId!, s])
      );

      // Delete existing lines for THIS proposal only, then recreate snapshots
      await prisma.proposalService.deleteMany({
        where: { proposalId: id },
      });

      const built = data.services.map((svc) => {
        const template = serviceTemplates.find((t) => t.id === svc.serviceId);
        const prior = existingByTemplateId.get(svc.serviceId);
        return buildProposalServiceRecord(
          {
            ...svc,
            serviceId: svc.serviceId,
            name: svc.name ?? prior?.name,
            description:
              svc.description !== undefined ? svc.description : prior?.description,
            displayPrice:
              svc.displayPrice !== undefined
                ? svc.displayPrice
                : prior?.displayPrice ?? prior?.unitPrice,
            billingFrequency:
              svc.billingFrequency ?? prior?.billingFrequency ?? prior?.frequency,
            vatRate: svc.vatRate ?? prior?.vatRate,
          },
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

    const refreshed = await prisma.proposal.findFirst({
      where: { id, tenantId: req.tenantId },
      include: {
        client: true,
        services: {
          include: {
            serviceTemplate: { select: { id: true, category: true } },
          },
        },
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: refreshed
        ? {
            ...refreshed,
            services: serializeProposalServicesForApi(refreshed.services as any),
          }
        : proposal,
    });
  })
);

/**
 * POST /api/proposals/:id/submit-for-approval
 * Junior/senior staff submit a draft for partner approval before sending
 */
router.post(
  '/:id/submit-for-approval',
  authenticate,
  authorize(...SUBMITTER_ROLES, ...APPROVER_ROLES),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const proposal = await prisma.proposal.findFirst({
      where: { id, tenantId: req.tenantId },
      include: { client: { select: { name: true } } },
    });

    if (!proposal) {
      throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
    }

    if (proposal.status !== 'DRAFT') {
      throw new ApiError('INVALID_STATUS', 'Only draft proposals can be submitted for approval', 400);
    }

    if (!['NONE', 'REJECTED'].includes(proposal.approvalStatus)) {
      throw new ApiError(
        'INVALID_APPROVAL_STATUS',
        'Proposal is already submitted or approved',
        400
      );
    }

    const updated = await prisma.proposal.update({
      where: { id },
      data: {
        approvalStatus: 'PENDING',
        submittedForApprovalAt: new Date(),
        rejectionReason: null,
        approvedAt: null,
        approvedById: null,
        approvalNotes: null,
      },
      include: {
        client: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        ...proposalApprovalInclude,
      },
    });

    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        proposalId: id,
        action: 'PROPOSAL_SUBMITTED_FOR_APPROVAL',
        entityType: 'PROPOSAL',
        entityId: id,
        description: `Submitted proposal "${proposal.title}" for partner approval`,
      },
    });

    res.json({
      success: true,
      data: updated,
      message: 'Proposal submitted for partner approval',
    });
  })
);

/**
 * POST /api/proposals/:id/approve
 * Partner/manager approves a pending proposal
 */
router.post(
  '/:id/approve',
  authenticate,
  authorize(...APPROVER_ROLES),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = z
      .object({
        approvalNotes: z.string().max(2000).optional(),
      })
      .parse(req.body ?? {});

    const proposal = await prisma.proposal.findFirst({
      where: { id, tenantId: req.tenantId },
    });

    if (!proposal) {
      throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
    }

    if (proposal.approvalStatus !== 'PENDING') {
      throw new ApiError('INVALID_APPROVAL_STATUS', 'Proposal is not awaiting approval', 400);
    }

    const updated = await prisma.proposal.update({
      where: { id },
      data: {
        approvalStatus: 'APPROVED',
        approvedAt: new Date(),
        approvedById: req.user!.id,
        approvalNotes: body.approvalNotes ?? null,
        rejectionReason: null,
      },
      include: {
        client: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        ...proposalApprovalInclude,
      },
    });

    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        proposalId: id,
        action: 'PROPOSAL_APPROVED',
        entityType: 'PROPOSAL',
        entityId: id,
        description: `Approved proposal "${proposal.title}"`,
        metadata: JSON.stringify({ approvalNotes: body.approvalNotes ?? null }),
      },
    });

    res.json({
      success: true,
      data: updated,
      message: 'Proposal approved',
    });
  })
);

/**
 * POST /api/proposals/:id/reject
 * Partner/manager rejects a pending proposal with a reason
 */
router.post(
  '/:id/reject',
  authenticate,
  authorize(...APPROVER_ROLES),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = z
      .object({
        rejectionReason: z.string().min(1, 'Rejection reason is required').max(2000),
        approvalNotes: z.string().max(2000).optional(),
      })
      .parse(req.body ?? {});

    const proposal = await prisma.proposal.findFirst({
      where: { id, tenantId: req.tenantId },
    });

    if (!proposal) {
      throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
    }

    if (proposal.approvalStatus !== 'PENDING') {
      throw new ApiError('INVALID_APPROVAL_STATUS', 'Proposal is not awaiting approval', 400);
    }

    const updated = await prisma.proposal.update({
      where: { id },
      data: {
        approvalStatus: 'REJECTED',
        rejectionReason: body.rejectionReason,
        approvalNotes: body.approvalNotes ?? null,
        approvedAt: null,
        approvedById: null,
      },
      include: {
        client: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        ...proposalApprovalInclude,
      },
    });

    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        proposalId: id,
        action: 'PROPOSAL_REJECTED',
        entityType: 'PROPOSAL',
        entityId: id,
        description: `Rejected proposal "${proposal.title}"`,
        metadata: JSON.stringify({
          rejectionReason: body.rejectionReason,
          approvalNotes: body.approvalNotes ?? null,
        }),
      },
    });

    res.json({
      success: true,
      data: updated,
      message: 'Proposal rejected',
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
  requireActiveSubscription,
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

    const userRole = req.user!.role;
    const overrideApproval = canOverrideApproval(userRole);

    if (proposal.approvalStatus === 'PENDING' && !overrideApproval) {
      throw new ApiError(
        'APPROVAL_PENDING',
        'This proposal is awaiting partner approval and cannot be sent yet',
        403
      );
    }

    if (proposal.approvalStatus === 'REJECTED' && !overrideApproval) {
      throw new ApiError(
        'APPROVAL_REJECTED',
        'This proposal was rejected. Revise and resubmit for partner approval before sending',
        403
      );
    }

    if (!canSendProposal(userRole, proposal.approvalStatus)) {
      throw new ApiError(
        'APPROVAL_REQUIRED',
        'Partner approval is required before this proposal can be sent',
        403
      );
    }

    if (!proposal.client.contactEmail) {
      throw new ApiError('NO_CLIENT_EMAIL', 'Client does not have an email address', 400);
    }

    const tenantSubdomain = proposal.tenant.subdomain;

    const { PDFGenerator } = await import('../services/pdfGenerator.js');
    const { tenantMailer } = await import('../services/tenantMailer.js');
    const { createShareableLink } = await import('../services/proposalSharingService.js');

    const pdfBuffer = await PDFGenerator.generateProposal(id);
    const pdfHeader = pdfBuffer.subarray(0, 5).toString('ascii');
    if (!pdfHeader.startsWith('%PDF')) {
      logger.warn(`Proposal ${id} PDF generation returned invalid header — attachment will be omitted`);
    }

    const frontendUrl = (process.env.FRONTEND_URL || 'https://capstonesoftware.co.uk/engage').replace(
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
        senderName: Array.from(new Set([req.user!.firstName, req.user!.lastName].filter(Boolean))).join(' '),
        senderPosition: await resolveSenderPosition(req.user!.id, req.user!.role),
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

    // Update status (partners/admins sending without prior approval are auto-approved)
    const sendUpdateData: {
      status: ProposalStatus;
      sentAt: Date;
      approvalStatus?: ApprovalStatus;
      approvedAt?: Date;
      approvedById?: string;
    } = {
      status: 'SENT',
      sentAt: new Date(),
    };

    if (
      overrideApproval &&
      proposal.approvalStatus !== 'APPROVED'
    ) {
      sendUpdateData.approvalStatus = 'APPROVED';
      sendUpdateData.approvedAt = new Date();
      sendUpdateData.approvedById = req.user!.id;
    }

    const updatedProposal = await prisma.proposal.update({
      where: { id },
      data: sendUpdateData,
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

    const { emitIntegrationEvent } = await import('../services/integrationEvents.js');
    void emitIntegrationEvent(req.tenantId!, proposal.id, 'proposal.sent');

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
      acceptedBy || Array.from(new Set([req.user?.firstName, req.user?.lastName].filter(Boolean))).join(' ').trim();

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

    try {
      const { sendPracticeAcceptanceNotifications } = await import(
        '../services/acceptanceNotificationService.js'
      );
      await sendPracticeAcceptanceNotifications({
        proposalId: proposal.id,
        tenantId: req.tenantId!,
        signatureId: result.signatureId!,
        signedBy: signerName,
        signedByRole: signatoryPosition || 'Authorised signatory',
        signerEmail: req.user?.email || null,
      });
    } catch (notifyErr) {
      logger.error('Failed to send practice acceptance notification:', notifyErr);
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
 * POST /api/proposals/:id/withdraw
 * Rescind/withdraw a sent or viewed proposal (revokes client share link)
 */
router.post(
  '/:id/withdraw',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MD', 'MANAGER', 'SENIOR'),
  requireActiveSubscription,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const proposal = await prisma.proposal.findFirst({
      where: { id, tenantId: req.tenantId },
      include: { client: true },
    });

    if (!proposal) {
      throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
    }

    if (proposal.status !== 'SENT' && proposal.status !== 'VIEWED') {
      throw new ApiError(
        'INVALID_STATUS',
        'Only sent or viewed proposals can be withdrawn',
        400
      );
    }

    if (proposal.shareToken || proposal.publicAccessEnabled) {
      await revokeShareableLink(id);
    }

    const updatedProposal = await prisma.proposal.update({
      where: { id },
      data: { status: 'WITHDRAWN' },
    });

    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user!.id,
        action: 'PROPOSAL_WITHDRAWN',
        entityType: 'PROPOSAL',
        entityId: proposal.id,
        description: `Withdrew proposal "${proposal.title}" sent to ${proposal.client.name}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({
      success: true,
      data: updatedProposal,
      message: 'Proposal withdrawn successfully',
    });
  })
);

/**
 * POST /api/proposals/:id/mark-lost
 * Practice marks an open quotation as lost (feeds win/loss stats)
 */
router.post(
  '/:id/mark-lost',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MD', 'MANAGER', 'SENIOR'),
  requireActiveSubscription,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = z
      .object({
        declineReason: z.enum(DECLINE_REASONS),
        reason: z.string().max(500).optional(),
      })
      .parse(req.body);

    const proposal = await prisma.proposal.findFirst({
      where: { id, tenantId: req.tenantId },
      include: { client: true },
    });

    if (!proposal) {
      throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
    }

    const markable: ProposalStatus[] = ['DRAFT', 'SENT', 'VIEWED', 'EXPIRED', 'WITHDRAWN'];
    if (!markable.includes(proposal.status)) {
      throw new ApiError(
        'INVALID_STATUS',
        'Only open quotations (draft, sent, viewed, expired, or rescinded) can be marked as lost',
        400
      );
    }

    if (proposal.shareToken || proposal.publicAccessEnabled) {
      await revokeShareableLink(id);
    }

    const reasonText = body.reason?.trim() || null;

    const updatedProposal = await prisma.proposal.update({
      where: { id },
      data: {
        status: 'LOST',
        declinedAt: new Date(),
        declineReason: body.declineReason,
        declineReasonText: reasonText,
        declinedBy: req.user!.email || `${req.user!.firstName} ${req.user!.lastName}`.trim(),
      },
    });

    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user!.id,
        action: 'PROPOSAL_MARKED_LOST',
        entityType: 'PROPOSAL',
        entityId: proposal.id,
        description: `Marked proposal "${proposal.title}" as lost (${body.declineReason})`,
        metadata: JSON.stringify({
          declineReason: body.declineReason,
          reason: reasonText,
          clientName: proposal.client.name,
        }),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({
      success: true,
      data: updatedProposal,
      message: 'Proposal marked as lost',
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
  authorize('ADMIN', 'PARTNER', 'MD', 'MANAGER'),
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
    const upliftRulesSchema = z.object({
      mode: z.enum(['percent', 'cpi', 'min_floor']),
      percent: z.number().min(-50).max(50).optional(),
      cpiPercent: z.number().min(0).max(50).optional(),
      minFeeGbp: z.number().min(0).optional(),
      perServiceFloors: z.record(z.string(), z.number().min(0)).optional(),
    });

    const body = z
      .object({
        upliftPercent: z.number().min(-50).max(50).optional(),
        upliftRules: upliftRulesSchema.optional(),
        templateId: z.string().uuid().optional(),
        useAiCoverLetter: z.boolean().optional(),
      })
      .parse(req.body ?? {});

    const { createRenewalDraft } = await import('../services/renewalProposalService.js');

    const renewalProposal = await createRenewalDraft(req.tenantId!, req.user!.id, id, {
      upliftPercent: body.upliftPercent,
      upliftRules: body.upliftRules as UpliftRules | undefined,
      templateId: body.templateId,
      useAiCoverLetter: body.useAiCoverLetter,
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
      WITHDRAWN: '#F59E0B',
      ARCHIVED: '#94A3B8',
      LOST: '#DC2626',
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
