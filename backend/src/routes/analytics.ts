import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { ApiError, asyncHandler } from '../middleware/errorHandler.js';
import logger from '../config/logger.js';
import { synthesiseWinLoss } from '../services/winLossSynthesisService.js';
import { getFeeBenchmarks } from '../services/feeBenchmarkService.js';
import { getProposalSettings } from '../utils/tenantProposalSettings.js';

const router = Router();

// All analytics routes require authentication
router.use(authenticate);

// Get dashboard analytics
router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

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
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get proposal stats
    const [
      totalProposals,
      proposalsThisMonth,
      proposalsLastMonth,
      proposalStatusBreakdown,
      totalValue,
      valueThisMonth,
      conversionRate,
      sentCount,
      viewedCount,
      signedCount,
      pipelineValue,
      monthlyRevenue,
      statusCounts,
      dailyActivity,
      recentActivities,
    ] = await Promise.all([
      // Total proposals
      prisma.proposal.count({
        where: { tenantId },
      }),

      // Proposals created this month
      prisma.proposal.count({
        where: {
          tenantId,
          createdAt: { gte: thirtyDaysAgo },
        },
      }),

      // Proposals created last month (for comparison)
      prisma.proposal.count({
        where: {
          tenantId,
          createdAt: {
            gte: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
            lt: thirtyDaysAgo,
          },
        },
      }),

      // Proposal status breakdown
      prisma.proposal.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { status: true },
      }),

      // Total value of all proposals
      prisma.proposal.aggregate({
        where: { tenantId },
        _sum: { total: true },
      }),

      // Value this month
      prisma.proposal.aggregate({
        where: {
          tenantId,
          createdAt: { gte: thirtyDaysAgo },
        },
        _sum: { total: true },
      }),

      // Conversion rate (accepted / total sent)
      prisma.$transaction([
        prisma.proposal.count({
          where: {
            tenantId,
            status: { in: ['SENT', 'VIEWED', 'ACCEPTED', 'DECLINED'] },
          },
        }),
        prisma.proposal.count({
          where: {
            tenantId,
            status: 'ACCEPTED',
          },
        }),
      ]),

      prisma.proposal.count({ where: { tenantId, status: 'SENT' } }),
      prisma.proposal.count({ where: { tenantId, status: 'VIEWED' } }),
      prisma.proposal.count({ where: { tenantId, status: 'ACCEPTED' } }),
      prisma.proposal.aggregate({
        where: { tenantId, status: { in: ['SENT', 'VIEWED'] } },
        _sum: { total: true },
      }),

      prisma.$queryRaw`
        SELECT DATE_TRUNC('month', "createdAt") as month, SUM(total) as revenue
        FROM "Proposal"
        WHERE "tenantId" = ${tenantId}
          AND status = 'ACCEPTED'
          AND "createdAt" >= ${sixMonthsAgo}
        GROUP BY DATE_TRUNC('month', "createdAt")
        ORDER BY month ASC
      ` as Promise<any[]>,

      prisma.proposal.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { status: true },
      }),

      prisma.$queryRaw`
        SELECT DATE("createdAt") as day,
          COUNT(*) FILTER (WHERE "entityType" = 'PROPOSAL') as proposals,
          COUNT(*) FILTER (WHERE action = 'VIEWED' OR action = 'PROPOSAL_VIEWED') as views
        FROM "ActivityLog"
        WHERE "tenantId" = ${tenantId}
          AND "createdAt" >= ${sevenDaysAgo}
        GROUP BY DATE("createdAt")
        ORDER BY day ASC
      ` as Promise<any[]>,

      prisma.activityLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    // Get client stats
    const [totalClients, newClientsThisMonth, activeClients] = await Promise.all([
      prisma.client.count({ where: { tenantId } }),
      prisma.client.count({
        where: {
          tenantId,
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      prisma.client.count({
        where: {
          tenantId,
          proposals: { some: {} },
        },
      }),
    ]);

    // Get monthly proposal trend (last 6 months)
    const trendSixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const monthlyTrend = await prisma.$queryRaw`
      SELECT 
        DATE_TRUNC('month', "createdAt") as month,
        COUNT(*) as count,
        SUM("total") as value,
        COUNT(CASE WHEN "status" = 'ACCEPTED' THEN 1 END) as accepted
      FROM "Proposal"
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" >= ${trendSixMonthsAgo}
      GROUP BY DATE_TRUNC('month', "createdAt")
      ORDER BY month ASC
    `;

    // Get top services by usage
    const topServices = await prisma.proposalService.groupBy({
      by: ['serviceTemplateId'],
      where: {
        proposal: { tenantId },
      },
      _count: { serviceTemplateId: true },
      _sum: { lineTotal: true },
      orderBy: { _count: { serviceTemplateId: 'desc' } },
      take: 5,
    });

    // Get service names for top services
    const serviceIds = topServices.map((s) => s.serviceTemplateId).filter(Boolean);
    const serviceNames = serviceIds.length
      ? await prisma.serviceTemplate.findMany({
          where: { id: { in: serviceIds as string[] } },
          select: { id: true, name: true },
        })
      : [];

    const topServicesWithNames = topServices.map((s) => ({
      ...s,
      name: serviceNames.find((n) => n.id === s.serviceTemplateId)?.name || 'Unknown Service',
    }));

    const [funnelSent, acceptedCount] = conversionRate;
    const conversionRatePercent =
      funnelSent > 0 ? Math.round((acceptedCount / funnelSent) * 100) : 0;
    const viewRate = sentCount > 0 ? Math.round((viewedCount / sentCount) * 100) : 0;
    const signRate = viewedCount > 0 ? Math.round((signedCount / viewedCount) * 100) : 0;

    const proposalGrowth =
      proposalsLastMonth > 0
        ? Math.round(((proposalsThisMonth - proposalsLastMonth) / proposalsLastMonth) * 100)
        : proposalsThisMonth > 0
          ? 100
          : 0;

    const statusColors: Record<string, string> = {
      DRAFT: '#9CA3AF',
      SENT: '#3B82F6',
      VIEWED: '#8B5CF6',
      ACCEPTED: '#10B981',
      DECLINED: '#EF4444',
      EXPIRED: '#6B7280',
    };

    const revenueData = (monthlyRevenue as any[]).map((row: any) => ({
      name: monthNames[new Date(row.month).getMonth()],
      value: Number(row.revenue) || 0,
    }));

    const proposalStatusData = statusCounts.map((s: any) => ({
      name: s.status.charAt(0) + s.status.slice(1).toLowerCase(),
      value: s._count.status,
      color: statusColors[s.status] || '#9CA3AF',
    }));

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weeklyActivity = (dailyActivity as any[]).map((row: any) => ({
      day: dayNames[new Date(row.day).getDay()],
      proposals: Number(row.proposals) || 0,
      views: Number(row.views) || 0,
    }));

    const activityTypeMap: Record<string, { message: string; color: string }> = {
      CREATED: { message: 'New proposal created', color: 'blue' },
      PROPOSAL_SENT: { message: 'Proposal sent', color: 'purple' },
      SENT: { message: 'Proposal sent', color: 'purple' },
      VIEWED: { message: 'Proposal viewed', color: 'gray' },
      PROPOSAL_SIGNED: { message: 'Proposal signed', color: 'green' },
      ACCEPTED: { message: 'Proposal accepted', color: 'green' },
      PROPOSAL_DECLINED: { message: 'Proposal declined', color: 'red' },
      DECLINED: { message: 'Proposal declined', color: 'red' },
    };

    const recentActivity = recentActivities.map((activity: any) => {
      const mapped = activityTypeMap[activity.action] || {
        message: activity.description || 'Activity recorded',
        color: 'gray',
      };
      return {
        id: activity.id,
        type: activity.action,
        message: mapped.message,
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
        proposals: {
          total: totalProposals,
          thisMonth: proposalsThisMonth,
          lastMonth: proposalsLastMonth,
          growth: proposalGrowth,
          sent: sentCount,
          viewed: viewedCount,
          signed: signedCount,
          statusBreakdown: proposalStatusBreakdown.reduce(
            (acc, item) => ({
              ...acc,
              [item.status]: item._count.status,
            }),
            {}
          ),
        },
        pipeline: {
          value: pipelineValue._sum.total || 0,
          currency: 'GBP',
        },
        revenue: {
          total: totalValue._sum.total || 0,
          accepted: signedCount,
          thisMonth: valueThisMonth._sum.total || 0,
          currency: 'GBP',
        },
        conversion: {
          rate: conversionRatePercent,
          sent: funnelSent,
          accepted: acceptedCount,
          viewRate,
          signRate,
        },
        clients: {
          total: totalClients,
          newThisMonth: newClientsThisMonth,
          active: activeClients,
        },
        monthlyTrend: (monthlyTrend as any[]).map((item) => ({
          month: item.month,
          count: Number(item.count),
          value: Number(item.value) || 0,
          accepted: Number(item.accepted),
        })),
        topServices: topServicesWithNames.map((s) => ({
          name: s.name,
          count: s._count.serviceTemplateId,
          revenue: s._sum.lineTotal || 0,
        })),
        revenueData,
        proposalStatusData,
        weeklyActivity,
        recentActivity,
      },
    });
  })
);

// Get proposal view analytics
router.get(
  '/proposal-views',
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const schema = z.object({
      proposalId: z.string().optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    });

    const { proposalId, startDate, endDate } = schema.parse(req.query);

    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const views = await prisma.proposalView.findMany({
      where: {
        proposal: {
          tenantId,
          ...(proposalId && { id: proposalId }),
        },
        ...(Object.keys(dateFilter).length > 0 && {
          viewedAt: dateFilter,
        }),
      },
      include: {
        proposal: {
          select: {
            id: true,
            reference: true,
            title: true,
            client: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: { viewedAt: 'desc' },
      take: 100,
    });

    // Aggregate stats
    const totalViews = views.length;
    const uniqueProposals = new Set(views.map((v) => v.proposalId)).size;
    const avgViewDuration =
      views.reduce((sum, v) => sum + (v.viewDuration || 0), 0) / totalViews || 0;

    res.json({
      success: true,
      data: {
        totalViews,
        uniqueProposals,
        avgViewDuration: Math.round(avgViewDuration),
        views: views.map((v) => ({
          id: v.id,
          proposalId: v.proposalId,
          proposalTitle: v.proposal.title,
          clientName: v.proposal.client.name,
          viewedAt: v.viewedAt,
          ipAddress: v.ipAddress,
          viewDuration: v.viewDuration,
          completed: v.completed,
        })),
      },
    });
  })
);

// Get client activity analytics
router.get(
  '/client-activity',
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;

    const clientsWithActivity = await prisma.client.findMany({
      where: { tenantId },
      include: {
        _count: {
          select: { proposals: true },
        },
        proposals: {
          select: {
            total: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const clientMetrics = clientsWithActivity.map((client) => ({
      id: client.id,
      name: client.name,
      totalProposals: client._count.proposals,
      totalValue: client.proposals.reduce(
        (sum, p) => sum + (p.status === 'ACCEPTED' ? p.total : 0),
        0
      ),
      conversionRate:
        client._count.proposals > 0
          ? Math.round(
              (client.proposals.filter((p) => p.status === 'ACCEPTED').length /
                client._count.proposals) *
                100
            )
          : 0,
      lastActivity: client.proposals.length > 0 ? client.proposals[0].createdAt : null,
    }));

    res.json({
      success: true,
      data: {
        clients: clientMetrics,
        summary: {
          totalClients: clientsWithActivity.length,
          avgProposalsPerClient:
            clientsWithActivity.reduce((sum, c) => sum + c._count.proposals, 0) /
              clientsWithActivity.length || 0,
        },
      },
    });
  })
);

// Get conversion funnel with full stages and drop-off rates
router.get(
  '/funnel',
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;

    const [
      draftCount,
      sentCount,
      viewedCount,
      acceptedCount,
      archivedWonCount,
      declinedCount,
      lostCount,
      expiredCount,
    ] = await Promise.all([
      prisma.proposal.count({ where: { tenantId, status: 'DRAFT' } }),
      prisma.proposal.count({ where: { tenantId, status: 'SENT' } }),
      prisma.proposal.count({ where: { tenantId, status: 'VIEWED' } }),
      prisma.proposal.count({ where: { tenantId, status: 'ACCEPTED' } }),
      prisma.proposal.count({
        where: { tenantId, status: 'ARCHIVED', acceptedAt: { not: null } },
      }),
      prisma.proposal.count({ where: { tenantId, status: 'DECLINED' } }),
      prisma.proposal.count({ where: { tenantId, status: 'LOST' } }),
      prisma.proposal.count({ where: { tenantId, status: 'EXPIRED' } }),
    ]);

    const wonCount = acceptedCount + archivedWonCount;
    const lostTotal = declinedCount + lostCount;
    const actionable = sentCount + viewedCount + wonCount + lostTotal + expiredCount;

    res.json({
      success: true,
      data: {
        stages: [
          { name: 'Draft', count: draftCount, color: 'bg-slate-400' },
          { name: 'Sent', count: sentCount, color: 'bg-blue-500' },
          { name: 'Viewed', count: viewedCount, color: 'bg-amber-500' },
          { name: 'Accepted', count: wonCount, color: 'bg-green-500' },
        ],
        outcomes: [
          { name: 'Accepted', count: wonCount, color: 'bg-green-500' },
          { name: 'Declined', count: lostTotal, color: 'bg-red-500' },
          { name: 'Expired', count: expiredCount, color: 'bg-slate-400' },
        ],
        conversionRates: {
          sentToViewed:
            actionable > 0
              ? Math.round(((viewedCount + wonCount + lostTotal + expiredCount) / actionable) * 100)
              : 0,
          viewedToAccepted:
            viewedCount + wonCount > 0
              ? Math.round((wonCount / (viewedCount + wonCount)) * 100)
              : 0,
          sentToAccepted: actionable > 0 ? Math.round((wonCount / actionable) * 100) : 0,
        },
      },
    });
  })
);

// Get revenue pipeline (active proposals + forecast)
router.get(
  '/revenue-pipeline',
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;

    const [pipelineProposals, acceptedRevenue, monthlyRecurring] = await Promise.all([
      // Pipeline: SENT + VIEWED proposals
      prisma.proposal.aggregate({
        where: {
          tenantId,
          status: { in: ['SENT', 'VIEWED'] },
        },
        _sum: { total: true, subtotal: true },
        _count: { id: true },
      }),
      // Accepted revenue
      prisma.proposal.aggregate({
        where: { tenantId, status: 'ACCEPTED' },
        _sum: { total: true },
      }),
      // Monthly recurring revenue (from accepted proposals with recurring services)
      prisma.$queryRaw`
        SELECT 
          SUM(CASE 
            WHEN ps."billingFrequency" = 'WEEKLY' THEN ps."grossTotal" * 52 / 12
            WHEN ps."billingFrequency" = 'MONTHLY' THEN ps."grossTotal"
            WHEN ps."billingFrequency" = 'QUARTERLY' THEN ps."grossTotal" / 3
            WHEN ps."billingFrequency" = 'ANNUALLY' THEN ps."grossTotal" / 12
            ELSE 0
          END) as monthly_recurring
        FROM "ProposalService" ps
        JOIN "Proposal" p ON p.id = ps."proposalId"
        WHERE p."tenantId" = ${tenantId}
          AND p.status = 'ACCEPTED'
          AND ps."billingFrequency" != 'ONE_TIME'
      `,
    ]);

    res.json({
      success: true,
      data: {
        pipeline: {
          value: pipelineProposals._sum.total || 0,
          subtotal: pipelineProposals._sum.subtotal || 0,
          count: pipelineProposals._count.id || 0,
        },
        accepted: {
          value: acceptedRevenue._sum.total || 0,
        },
        monthlyRecurring: Number((monthlyRecurring as any[])[0]?.monthly_recurring) || 0,
        forecast: {
          // Pipeline value × conversion rate (assumed 30% if no data)
          expectedValue: Math.round((pipelineProposals._sum.total || 0) * 0.3),
        },
      },
    });
  })
);

// Get time-to-decision metrics
router.get(
  '/time-to-decision',
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;

    const acceptedProposals = await prisma.proposal.findMany({
      where: {
        tenantId,
        status: 'ACCEPTED',
        sentAt: { not: null },
        acceptedAt: { not: null },
      },
      select: {
        sentAt: true,
        acceptedAt: true,
        viewedAt: true,
      },
      take: 1000,
    });

    const declinedProposals = await prisma.proposal.findMany({
      where: {
        tenantId,
        status: 'DECLINED',
        sentAt: { not: null },
        declinedAt: { not: null },
      },
      select: {
        sentAt: true,
        declinedAt: true,
      },
      take: 1000,
    });

    const avgDaysToAccept =
      acceptedProposals.length > 0
        ? Math.round(
            acceptedProposals.reduce((sum, p) => {
              const days =
                (new Date(p.acceptedAt!).getTime() - new Date(p.sentAt!).getTime()) /
                (1000 * 60 * 60 * 24);
              return sum + days;
            }, 0) / acceptedProposals.length
          )
        : 0;

    const avgDaysToDecline =
      declinedProposals.length > 0
        ? Math.round(
            declinedProposals.reduce((sum, p) => {
              const days =
                (new Date(p.declinedAt!).getTime() - new Date(p.sentAt!).getTime()) /
                (1000 * 60 * 60 * 24);
              return sum + days;
            }, 0) / declinedProposals.length
          )
        : 0;

    const avgDaysToView =
      acceptedProposals.filter((p) => p.viewedAt).length > 0
        ? Math.round(
            acceptedProposals
              .filter(
                (p): p is typeof p & { viewedAt: Date; sentAt: Date } => !!p.viewedAt && !!p.sentAt
              )
              .reduce((sum, p) => {
                const days =
                  (new Date(p.viewedAt).getTime() - new Date(p.sentAt).getTime()) /
                  (1000 * 60 * 60 * 24);
                return sum + days;
              }, 0) / acceptedProposals.filter((p) => p.viewedAt).length
          )
        : 0;

    res.json({
      success: true,
      data: {
        avgDaysToAccept,
        avgDaysToDecline,
        avgDaysToView,
        sampleSize: {
          accepted: acceptedProposals.length,
          declined: declinedProposals.length,
        },
      },
    });
  })
);

/** GET /api/analytics/attention-summary — proposals grouped by Clara priority */
router.get(
  '/attention-summary',
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const now = Date.now();

    const proposals = await prisma.proposal.findMany({
      where: {
        tenantId,
        status: { in: ['SENT', 'VIEWED'] },
        sentAt: { not: null },
      },
      include: {
        client: { select: { id: true, name: true } },
        views: { select: { id: true, viewedAt: true } },
      },
      orderBy: { total: 'desc' },
      take: 200,
    });

    type AttentionItem = {
      id: string;
      reference: string;
      title: string;
      clientName: string;
      clientId: string;
      status: string;
      total: number;
      sentAt: string;
      validUntil: string;
      daysSinceSent: number;
      daysUntilExpiry: number;
      viewCount: number;
      priority: 'stuck' | 'no_views' | 'expiring';
      healthScore: number;
    };

    const stuck: AttentionItem[] = [];
    const noViews: AttentionItem[] = [];
    const expiring: AttentionItem[] = [];

    for (const p of proposals) {
      const daysSinceSent = Math.floor((now - new Date(p.sentAt!).getTime()) / 86400000);
      const daysUntilExpiry = Math.floor((new Date(p.validUntil).getTime() - now) / 86400000);
      const viewCount = p.views.length;

      const isStuck = daysSinceSent > 14 && p.status === 'SENT';
      const isNoViews = viewCount === 0 && p.status === 'SENT' && daysSinceSent > 3;
      const isExpiring = daysUntilExpiry >= 0 && daysUntilExpiry <= 7 && p.status !== 'ACCEPTED';

      if (!isStuck && !isNoViews && !isExpiring) continue;

      let healthScore = 70;
      if (isStuck) healthScore = 35;
      else if (isNoViews && daysSinceSent > 7) healthScore = 45;
      else if (isExpiring) healthScore = Math.min(healthScore, 50);

      const base: Omit<AttentionItem, 'priority'> = {
        id: p.id,
        reference: p.reference,
        title: p.title,
        clientName: p.client.name,
        clientId: p.client.id,
        status: p.status,
        total: p.total,
        sentAt: p.sentAt!.toISOString(),
        validUntil: p.validUntil.toISOString(),
        daysSinceSent,
        daysUntilExpiry,
        viewCount,
        healthScore,
      };

      if (isStuck) {
        stuck.push({ ...base, priority: 'stuck' });
      }
      if (isNoViews) {
        noViews.push({ ...base, priority: 'no_views' });
      }
      if (isExpiring) {
        expiring.push({ ...base, priority: 'expiring' });
      }
    }

    const sortByUrgency = (a: AttentionItem, b: AttentionItem) =>
      a.healthScore - b.healthScore || b.total - a.total;

    stuck.sort(sortByUrgency);
    noViews.sort(sortByUrgency);
    expiring.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry || b.total - a.total);

    res.json({
      success: true,
      data: {
        summary: {
          stuck: stuck.length,
          noViews: noViews.length,
          expiring: expiring.length,
          total: stuck.length + noViews.length + expiring.length,
        },
        groups: {
          stuck,
          noViews,
          expiring,
        },
        narrator:
          stuck.length + noViews.length + expiring.length === 0
            ? 'No proposals need urgent attention right now.'
            : `${stuck.length} stuck, ${noViews.length} unopened, and ${expiring.length} expiring soon — review the highest-value items first.`,
      },
    });
  })
);

/** GET /api/analytics/proposal-funnel — sent → opened → viewed → signed → paid */
router.get(
  '/proposal-funnel',
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const defaultEnd = new Date();
    const defaultStart = new Date(defaultEnd.getTime() - 90 * 24 * 60 * 60 * 1000);

    const start = req.query.startDate ? new Date(String(req.query.startDate)) : defaultStart;
    const end = req.query.endDate ? new Date(String(req.query.endDate)) : defaultEnd;

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new ApiError(
        'INVALID_DATE_RANGE',
        'startDate and endDate must be valid ISO dates',
        400
      );
    }

    const proposals = await prisma.proposal.findMany({
      where: {
        tenantId,
        sentAt: { gte: start, lte: end },
      },
      select: {
        viewedAt: true,
        acceptedAt: true,
        paidAt: true,
        paymentStatus: true,
        emailHistory: true,
      },
    });

    const sent = proposals.length;
    let opened = 0;
    let viewed = 0;
    let signed = 0;
    let paid = 0;

    for (const proposal of proposals) {
      if (proposal.viewedAt) viewed += 1;
      if (proposal.acceptedAt) signed += 1;
      if (
        proposal.paidAt ||
        proposal.paymentStatus === 'PAID' ||
        proposal.paymentStatus === 'COMPLETED'
      ) {
        paid += 1;
      }

      let emailOpened = false;
      try {
        const history = JSON.parse(proposal.emailHistory || '[]') as Array<Record<string, unknown>>;
        emailOpened = history.some(
          (entry) =>
            entry.event === 'opened' || entry.deliveryStatus === 'opened' || entry.opened === true
        );
      } catch {
        emailOpened = false;
      }

      if (emailOpened || proposal.viewedAt) opened += 1;
    }

    const pct = (numerator: number, denominator: number) =>
      denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;

    res.json({
      success: true,
      data: {
        dateRange: { start: start.toISOString(), end: end.toISOString() },
        funnel: { sent, opened, viewed, signed, paid },
        conversionRates: {
          sentToOpened: pct(opened, sent),
          openedToSigned: pct(signed, opened),
          sentToSigned: pct(signed, sent),
          signedToPaid: pct(paid, signed),
        },
        stages: [
          { key: 'sent', label: 'Sent', count: sent, color: 'bg-blue-500' },
          { key: 'opened', label: 'Opened', count: opened, color: 'bg-indigo-500' },
          { key: 'viewed', label: 'Viewed', count: viewed, color: 'bg-amber-500' },
          { key: 'signed', label: 'Signed', count: signed, color: 'bg-green-500' },
          { key: 'paid', label: 'Paid', count: paid, color: 'bg-emerald-600' },
        ],
      },
    });
  })
);

/** GET /api/analytics/win-loss — monthly win/loss synthesis */
router.get(
  '/win-loss',
  asyncHandler(async (req, res) => {
    const monthsBack = Math.min(12, Math.max(1, Number(req.query.months) || 1));
    const data = await synthesiseWinLoss(req.tenantId!, monthsBack);
    res.json({ success: true, data });
  })
);

/** GET /api/analytics/fee-benchmarks — anonymised cross-practice fee bands */
router.get(
  '/fee-benchmarks',
  asyncHandler(async (req, res) => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId! },
      select: { settings: true },
    });
    const optedIn = getProposalSettings(tenant?.settings).benchmarksOptIn;
    const data = await getFeeBenchmarks();
    res.json({
      success: true,
      data: {
        ...data,
        optedIn,
      },
    });
  })
);

export default router;
