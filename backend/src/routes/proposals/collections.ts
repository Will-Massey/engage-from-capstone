import { Router } from 'express';
import { z } from 'zod';
import { ApprovalStatus, ProposalStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { asyncHandler, ApiError } from '../../middleware/errorHandler.js';
import logger from '../../config/logger.js';
import { UpliftRules } from '../../services/renewalProposalService.js';
import { resolveProposalTerms } from '../../services/proposalTermsService.js';
import { APPROVER_ROLES } from './shared.js';

const router = Router();

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

    const { findRenewalCandidates, parseExpiringBeforeInput } =
      await import('../../services/renewalProposalService.js');

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
/**
 * POST /api/proposals/terms-preview
 * Preview the engagement terms for a set of services (used live by the proposal
 * builder). Returns the resolved terms text for the caller's tenant.
 */
router.post(
  '/terms-preview',
  authenticate,
  asyncHandler(async (req, res) => {
    const { serviceIds } = z
      .object({ serviceIds: z.array(z.string()).default([]) })
      .parse(req.body);

    const templates = serviceIds.length
      ? await prisma.serviceTemplate.findMany({
          where: { id: { in: serviceIds }, tenantId: req.tenantId },
          select: { name: true, tags: true },
        })
      : [];

    const terms = await resolveProposalTerms(
      req.tenantId!,
      templates.map((t) => ({ name: t.name, tags: t.tags }))
    );

    res.json({ success: true, data: { terms } });
  })
);

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

    if (!body.clientIds?.length && !body.proposalIds?.length && !body.expiringBefore) {
      throw new ApiError(
        'INVALID_REQUEST',
        'Provide clientIds, proposalIds, or expiringBefore',
        400
      );
    }

    const { bulkCreateRenewalDrafts, parseExpiringBeforeInput } =
      await import('../../services/renewalProposalService.js');

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
