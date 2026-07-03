/**
 * Agency sub-account management — parent practices managing child tenant accounts via settings JSON.
 */
import { prisma } from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';

export interface AgencySubAccount {
  tenantId: string;
  name: string;
  subdomain: string;
  createdAt: string;
  isActive: boolean;
}

function parseSettings(raw: string | null): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

export async function listAgencySubAccounts(parentTenantId: string): Promise<AgencySubAccount[]> {
  const parent = await prisma.tenant.findUnique({
    where: { id: parentTenantId },
    select: { settings: true, subscriptionTier: true },
  });

  if (!parent) throw new ApiError('NOT_FOUND', 'Practice not found', 404);

  const tier = (parent.subscriptionTier || '').toUpperCase();
  if (!['ENTERPRISE', 'ENTERPRISE_ANNUAL'].includes(tier)) {
    throw new ApiError('TIER_REQUIRED', 'Agency sub-accounts require Enterprise plan', 402);
  }

  const settings = parseSettings(parent.settings);
  const subs = (settings.agencySubAccounts as AgencySubAccount[]) || [];

  const enriched = await Promise.all(
    subs.map(async (sub) => {
      const tenant = await prisma.tenant.findUnique({
        where: { id: sub.tenantId },
        select: { isActive: true, name: true, subdomain: true },
      });
      return {
        ...sub,
        name: tenant?.name || sub.name,
        subdomain: tenant?.subdomain || sub.subdomain,
        isActive: tenant?.isActive ?? false,
      };
    }),
  );

  return enriched;
}

export async function linkAgencySubAccount(
  parentTenantId: string,
  childTenantId: string,
): Promise<AgencySubAccount> {
  const [parent, child] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: parentTenantId }, select: { settings: true, subscriptionTier: true } }),
    prisma.tenant.findUnique({ where: { id: childTenantId }, select: { id: true, name: true, subdomain: true, settings: true } }),
  ]);

  if (!parent || !child) throw new ApiError('NOT_FOUND', 'Tenant not found', 404);

  const tier = (parent.subscriptionTier || '').toUpperCase();
  if (!['ENTERPRISE', 'ENTERPRISE_ANNUAL'].includes(tier)) {
    throw new ApiError('TIER_REQUIRED', 'Agency sub-accounts require Enterprise plan', 402);
  }

  const parentSettings = parseSettings(parent.settings);
  const subs: AgencySubAccount[] = (parentSettings.agencySubAccounts as AgencySubAccount[]) || [];

  if (subs.some((s) => s.tenantId === childTenantId)) {
    throw new ApiError('ALREADY_LINKED', 'Sub-account already linked', 409);
  }

  const entry: AgencySubAccount = {
    tenantId: child.id,
    name: child.name,
    subdomain: child.subdomain,
    createdAt: new Date().toISOString(),
    isActive: true,
  };

  subs.push(entry);
  parentSettings.agencySubAccounts = subs;

  const childSettings = parseSettings(child.settings);
  childSettings.parentAgencyId = parentTenantId;

  await prisma.$transaction([
    prisma.tenant.update({
      where: { id: parentTenantId },
      data: { settings: JSON.stringify(parentSettings) },
    }),
    prisma.tenant.update({
      where: { id: childTenantId },
      data: { settings: JSON.stringify(childSettings) },
    }),
  ]);

  return entry;
}