import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { asyncHandler, ApiError } from '../../middleware/errorHandler.js';
import { enforceTierLimit } from '../../middleware/tierLimits.js';
import logger from '../../config/logger.js';
import { getProposalViewStats } from '../../services/proposalSharingService.js';
import {
  buildProposalServiceRecord,
  calculateHeaderTotals,
  penceToPounds,
} from '../../utils/proposalPricing.js';
import {
  serializeProposalServicesForApi,
  proposalMoneyForApi,
} from '../../utils/proposalServiceSnapshot.js';
import {
  mergeProposalCustomFields,
  parseProposalCustomFields,
  serializeProposalCustomFields,
} from '../../utils/proposalCustomFields.js';
import {
  addDays,
  formatPaymentTerms,
  getProposalSettings,
  parseProposalDateInput,
} from '../../utils/tenantProposalSettings.js';
import { getProposalRegulatoryFit } from '../../services/regulatoryFitService.js';
import { resolveProposalTerms } from '../../services/proposalTermsService.js';
import {
  createProposalSchema,
  generateReference,
  parseOneOffDueDate,
  proposalApprovalInclude,
  updateProposalSchema,
} from './shared.js';

const router = Router();

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
        ...proposalMoneyForApi(proposal),
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

    const { subtotalPence, vatAmountPence, totalPence } =
      calculateHeaderTotals(servicesWithClearPricing);

    // Generate reference
    const reference = generateReference('PROP');

    const parsedValidUntil = parseProposalDateInput(data.validUntil);
    const validUntil =
      parsedValidUntil && parsedValidUntil !== null
        ? parsedValidUntil
        : addDays(new Date(), proposalSettings.defaultExpiryDays);

    const contractStartDate =
      data.contractStartDate !== undefined ? parseProposalDateInput(data.contractStartDate) : null;

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
        discountType: data.discountType,
        discountValue: data.discountValue,
        vatRate: 20, // Default VAT rate
        subtotalPence,
        discountAmountPence: 0, // Line-level discounts are already applied
        vatAmountPence,
        totalPence,
        paymentTerms:
          data.paymentTerms || formatPaymentTerms(proposalSettings.defaultPaymentTermsDays),
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
          ? serializeProposalCustomFields(
              data.customFields as import('../../utils/proposalCustomFields.js').ProposalCustomFields
            )
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
        ...proposalMoneyForApi(proposal),
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
      const incoming =
        data.customFields as import('../../utils/proposalCustomFields.js').ProposalCustomFields;
      const {
        selectedTierId: _st,
        selectedTierLabel: _stl,
        signaturesReceived: _sr,
        ...builderFields
      } = incoming;
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

      const built = data.services.map((svc) => {
        const template = serviceTemplates.find((t) => t.id === svc.serviceId);
        const prior = existingByTemplateId.get(svc.serviceId);
        return buildProposalServiceRecord(
          {
            ...svc,
            serviceId: svc.serviceId,
            name: svc.name ?? prior?.name,
            description: svc.description !== undefined ? svc.description : prior?.description,
            displayPrice:
              svc.displayPrice !== undefined
                ? svc.displayPrice
                : prior
                  ? penceToPounds(prior.displayPricePence ?? prior.unitPricePence)
                  : undefined,
            billingFrequency: svc.billingFrequency ?? prior?.billingFrequency ?? prior?.frequency,
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

      const totals = calculateHeaderTotals(built);

      // Atomic line-item swap: delete the old lines, recreate the snapshots, and
      // rewrite the header totals in one transaction so a mid-way failure can
      // never leave the proposal with missing lines or totals out of sync.
      await prisma.$transaction([
        prisma.proposalService.deleteMany({ where: { proposalId: id } }),
        prisma.proposalService.createMany({ data: servicesToCreate as any }),
        prisma.proposal.update({
          where: { id },
          data: {
            subtotalPence: totals.subtotalPence,
            vatAmountPence: totals.vatAmountPence,
            totalPence: totals.totalPence,
          },
        }),
      ]);
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
            ...proposalMoneyForApi(refreshed),
            services: serializeProposalServicesForApi(refreshed.services as any),
          }
        : proposal,
    });
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

export default router;
