/**
 * Sync Engage tenants/users/metrics to Capstone Superadmin.
 */
import { PrismaClient } from '@prisma/client';
import { createConnector } from '../lib/superadmin.js';
import logger from '../utils/logger.js';

const prisma = new PrismaClient();
const APP_ID = 'engage';

export function isSuperadminSyncConfigured(): boolean {
  return Boolean(process.env.SUPERADMIN_URL && process.env.SUPERADMIN_WEBHOOK_SECRET);
}

export async function syncEngageToSuperadmin() {
  if (!isSuperadminSyncConfigured()) {
    return { skipped: true };
  }

  const connector = createConnector({ appId: APP_ID });

  const tenants = await prisma.tenant.findMany({
    include: { _count: { select: { users: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const [activeUsers, totalUsers, totalProposals] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count(),
    prisma.proposal.count(),
  ]);

  await connector.syncAllTenants(
    tenants.map((t) => ({
      externalTenantId: t.id,
      name: t.name,
      plan: t.subscriptionTier || 'standard',
      planStatus: t.subscriptionStatus || (t.isActive ? 'active' : 'inactive'),
      userCount: t._count.users,
    }))
  );

  await connector.reportDailyMetrics({
    activeUsers,
    trials: tenants.filter((t) => t.subscriptionStatus === 'trial').length,
    signups: totalUsers,
  });

  await connector.client.pushMetrics([
    { metric: 'total_users', value: totalUsers },
    { metric: 'proposals', value: totalProposals },
    { metric: 'tenants', value: tenants.length },
  ]);

  logger.info('[engage] Superadmin sync complete', {
    tenants: tenants.length,
    totalUsers,
  });

  return { synced: true, tenants: tenants.length, totalUsers };
}