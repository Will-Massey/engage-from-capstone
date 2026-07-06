/**
 * Agency sub-account management — parent practices managing child tenant accounts via settings JSON.
 */
import { randomBytes } from 'node:crypto';
import { prisma } from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';

export interface AgencySubAccount {
  tenantId: string;
  name: string;
  subdomain: string;
  createdAt: string;
  isActive: boolean;
}

interface AgencyLinkInvite {
  code: string;
  expiresAt: string;
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
    })
  );

  return enriched;
}

/**
 * A practice issues a single-use invite code that it hands to the agency that
 * will manage it. Linking cannot proceed without this code, so a parent tenant
 * can never attach an arbitrary child without the child's explicit consent.
 */
export async function createAgencyLinkInvite(
  childTenantId: string
): Promise<{ code: string; expiresAt: string }> {
  const child = await prisma.tenant.findUnique({
    where: { id: childTenantId },
    select: { settings: true },
  });
  if (!child) throw new ApiError('NOT_FOUND', 'Practice not found', 404);

  const invite: AgencyLinkInvite = {
    code: randomBytes(24).toString('base64url'),
    expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
  };

  const settings = parseSettings(child.settings);
  settings.agencyLinkInvite = invite;
  await prisma.tenant.update({
    where: { id: childTenantId },
    data: { settings: JSON.stringify(settings) },
  });

  return invite;
}

export async function linkAgencySubAccount(
  parentTenantId: string,
  childTenantId: string,
  inviteCode: string
): Promise<AgencySubAccount> {
  if (parentTenantId === childTenantId) {
    throw new ApiError('INVALID_TARGET', 'A practice cannot link itself', 400);
  }

  const [parent, child] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: parentTenantId },
      select: { settings: true, subscriptionTier: true },
    }),
    prisma.tenant.findUnique({
      where: { id: childTenantId },
      select: { id: true, name: true, subdomain: true, settings: true },
    }),
  ]);

  if (!parent || !child) throw new ApiError('NOT_FOUND', 'Tenant not found', 404);

  const tier = (parent.subscriptionTier || '').toUpperCase();
  if (!['ENTERPRISE', 'ENTERPRISE_ANNUAL'].includes(tier)) {
    throw new ApiError('TIER_REQUIRED', 'Agency sub-accounts require Enterprise plan', 402);
  }

  // Consent gate: the child must have issued a still-valid invite code.
  const childSettings = parseSettings(child.settings);
  const invite = childSettings.agencyLinkInvite as AgencyLinkInvite | undefined;
  if (
    !invite ||
    !inviteCode ||
    invite.code !== inviteCode ||
    new Date(invite.expiresAt).getTime() < Date.now()
  ) {
    throw new ApiError(
      'INVITE_INVALID',
      'This practice has not authorised linking, or the invite has expired',
      403
    );
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

  childSettings.parentAgencyId = parentTenantId;
  delete childSettings.agencyLinkInvite; // consume the single-use invite

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
