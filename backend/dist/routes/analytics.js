"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const database_js_1 = require("../config/database.js");
const auth_js_1 = require("../middleware/auth.js");
const errorHandler_js_1 = require("../middleware/errorHandler.js");
const router = (0, express_1.Router)();
// All analytics routes require authentication
router.use(auth_js_1.authenticate);
// Get dashboard analytics
router.get('/dashboard', (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const tenantId = req.tenantId;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    // Get proposal stats
    const [totalProposals, proposalsThisMonth, proposalsLastMonth, proposalStatusBreakdown, totalValue, valueThisMonth, conversionRate,] = await Promise.all([
        // Total proposals
        database_js_1.prisma.proposal.count({
            where: { tenantId },
        }),
        // Proposals created this month
        database_js_1.prisma.proposal.count({
            where: {
                tenantId,
                createdAt: { gte: thirtyDaysAgo },
            },
        }),
        // Proposals created last month (for comparison)
        database_js_1.prisma.proposal.count({
            where: {
                tenantId,
                createdAt: {
                    gte: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
                    lt: thirtyDaysAgo,
                },
            },
        }),
        // Proposal status breakdown
        database_js_1.prisma.proposal.groupBy({
            by: ['status'],
            where: { tenantId },
            _count: { status: true },
        }),
        // Total value of all proposals
        database_js_1.prisma.proposal.aggregate({
            where: { tenantId },
            _sum: { total: true },
        }),
        // Value this month
        database_js_1.prisma.proposal.aggregate({
            where: {
                tenantId,
                createdAt: { gte: thirtyDaysAgo },
            },
            _sum: { total: true },
        }),
        // Conversion rate (accepted / total sent)
        database_js_1.prisma.$transaction([
            database_js_1.prisma.proposal.count({
                where: {
                    tenantId,
                    status: { in: ['SENT', 'VIEWED', 'ACCEPTED', 'DECLINED'] },
                },
            }),
            database_js_1.prisma.proposal.count({
                where: {
                    tenantId,
                    status: 'ACCEPTED',
                },
            }),
        ]),
    ]);
    // Get client stats
    const [totalClients, newClientsThisMonth, activeClients,] = await Promise.all([
        database_js_1.prisma.client.count({ where: { tenantId } }),
        database_js_1.prisma.client.count({
            where: {
                tenantId,
                createdAt: { gte: thirtyDaysAgo },
            },
        }),
        database_js_1.prisma.client.count({
            where: {
                tenantId,
                proposals: { some: {} },
            },
        }),
    ]);
    // Get monthly proposal trend (last 6 months)
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const monthlyTrend = await database_js_1.prisma.$queryRaw `
      SELECT 
        DATE_TRUNC('month', "createdAt") as month,
        COUNT(*) as count,
        SUM("total") as value,
        COUNT(CASE WHEN "status" = 'ACCEPTED' THEN 1 END) as accepted
      FROM "Proposal"
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" >= ${sixMonthsAgo}
      GROUP BY DATE_TRUNC('month', "createdAt")
      ORDER BY month ASC
    `;
    // Get top services by usage
    const topServices = await database_js_1.prisma.proposalService.groupBy({
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
    const serviceIds = topServices
        .map((s) => s.serviceTemplateId)
        .filter(Boolean);
    const serviceNames = serviceIds.length
        ? await database_js_1.prisma.serviceTemplate.findMany({
            where: { id: { in: serviceIds } },
            select: { id: true, name: true },
        })
        : [];
    const topServicesWithNames = topServices.map((s) => ({
        ...s,
        name: serviceNames.find((n) => n.id === s.serviceTemplateId)?.name ||
            'Unknown Service',
    }));
    // Calculate conversion rate
    const [sentCount, acceptedCount] = conversionRate;
    const conversionRatePercent = sentCount > 0 ? Math.round((acceptedCount / sentCount) * 100) : 0;
    // Calculate growth percentages
    const proposalGrowth = proposalsLastMonth > 0
        ? Math.round(((proposalsThisMonth - proposalsLastMonth) / proposalsLastMonth) *
            100)
        : proposalsThisMonth > 0
            ? 100
            : 0;
    res.json({
        success: true,
        data: {
            proposals: {
                total: totalProposals,
                thisMonth: proposalsThisMonth,
                lastMonth: proposalsLastMonth,
                growth: proposalGrowth,
                statusBreakdown: proposalStatusBreakdown.reduce((acc, item) => ({
                    ...acc,
                    [item.status]: item._count.status,
                }), {}),
            },
            revenue: {
                total: totalValue._sum.total || 0,
                thisMonth: valueThisMonth._sum.total || 0,
                currency: 'GBP',
            },
            conversion: {
                rate: conversionRatePercent,
                sent: sentCount,
                accepted: acceptedCount,
            },
            clients: {
                total: totalClients,
                newThisMonth: newClientsThisMonth,
                active: activeClients,
            },
            monthlyTrend: monthlyTrend.map((item) => ({
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
        },
    });
}));
// Get proposal view analytics
router.get('/proposal-views', (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const tenantId = req.tenantId;
    const schema = zod_1.z.object({
        proposalId: zod_1.z.string().optional(),
        startDate: zod_1.z.string().datetime().optional(),
        endDate: zod_1.z.string().datetime().optional(),
    });
    const { proposalId, startDate, endDate } = schema.parse(req.query);
    const dateFilter = {};
    if (startDate)
        dateFilter.gte = new Date(startDate);
    if (endDate)
        dateFilter.lte = new Date(endDate);
    const views = await database_js_1.prisma.proposalView.findMany({
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
    const avgViewDuration = views.reduce((sum, v) => sum + (v.viewDuration || 0), 0) / totalViews || 0;
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
}));
// Get client activity analytics
router.get('/client-activity', (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const tenantId = req.tenantId;
    const clientsWithActivity = await database_js_1.prisma.client.findMany({
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
        totalValue: client.proposals.reduce((sum, p) => sum + (p.status === 'ACCEPTED' ? p.total : 0), 0),
        conversionRate: client._count.proposals > 0
            ? Math.round((client.proposals.filter((p) => p.status === 'ACCEPTED').length /
                client._count.proposals) *
                100)
            : 0,
        lastActivity: client.proposals.length > 0 ? client.proposals[0].createdAt : null,
    }));
    res.json({
        success: true,
        data: {
            clients: clientMetrics,
            summary: {
                totalClients: clientsWithActivity.length,
                avgProposalsPerClient: clientsWithActivity.reduce((sum, c) => sum + c._count.proposals, 0) / clientsWithActivity.length || 0,
            },
        },
    });
}));
exports.default = router;
//# sourceMappingURL=analytics.js.map