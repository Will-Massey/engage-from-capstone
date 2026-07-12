import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { asyncHandler, ApiError } from '../../middleware/errorHandler.js';
import { APPROVER_ROLES, SUBMITTER_ROLES, proposalApprovalInclude } from './shared.js';
import { archiveSupersededOriginal } from '../../services/renewalProposalService.js';

const router = Router();

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
      throw new ApiError(
        'INVALID_STATUS',
        'Only draft proposals can be submitted for approval',
        400
      );
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

    // Deferred archive for agentically drafted renewals (Clara passes
    // archiveOriginal: false at draft time so the accepted original stays live
    // until a human approves). Only fires while the original is still
    // ACCEPTED — manually created renewals archive their original at draft
    // time, so this is a no-op for them, and repeat runs are impossible
    // because approval requires approvalStatus PENDING.
    if (updated.isRenewal && updated.originalProposalId) {
      const original = await prisma.proposal.findFirst({
        where: { id: updated.originalProposalId, tenantId: req.tenantId, status: 'ACCEPTED' },
        select: { id: true, reference: true, shareToken: true, publicAccessEnabled: true },
      });
      if (original) {
        await archiveSupersededOriginal(req.tenantId!, req.user!.id, original, {
          id: updated.id,
          reference: updated.reference,
        });
      }
    }

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

export default router;
