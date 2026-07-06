/**
 * W4.3 — Multi-firm workspace (accounting groups)
 */
import { UserRole } from '@prisma/client';
import { prisma } from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';

const GROUP_ADMIN_ROLES: UserRole[] = ['ADMIN', 'PARTNER'];

export interface FirmGroupPracticeSummary {
  id: string;
  name: string;
  subdomain: string;
  isOwner: boolean;
  isCurrent: boolean;
  userCount: number;
  clientCount: number;
  joinedAt: string;
}

export interface FirmGroupContext {
  assigned: boolean;
  canAdmin: boolean;
  isOwnerPractice: boolean;
  firmGroup: {
    id: string;
    name: string;
    slug: string;
    ownerTenantId: string | null;
    practiceCount: number;
    createdAt: string;
  } | null;
  practices: FirmGroupPracticeSummary[];
  practice: { id: string; name: string; subdomain: string };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function uniqueSlug(base: string): Promise<string> {
  const slug = base || 'firm-group';
  let n = 0;
  for (;;) {
    const candidate = n === 0 ? slug : `${slug}-${n}`;
    const exists = await prisma.firmGroup.findUnique({ where: { slug: candidate } });
    if (!exists) return candidate;
    n++;
  }
}

function assertGroupAdmin(role: UserRole, tenantId: string, ownerTenantId: string | null) {
  if (!GROUP_ADMIN_ROLES.includes(role)) {
    throw new ApiError('FORBIDDEN', 'Only practice administrators can manage the firm group', 403);
  }
  if (!ownerTenantId || tenantId !== ownerTenantId) {
    throw new ApiError(
      'FORBIDDEN',
      'Only the owner practice can administer this firm group workspace',
      403
    );
  }
}

async function loadGroupContext(tenantId: string, userRole: UserRole): Promise<FirmGroupContext> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      subdomain: true,
      firmGroupId: true,
      firmGroup: {
        select: {
          id: true,
          name: true,
          slug: true,
          ownerTenantId: true,
          createdAt: true,
          tenants: {
            select: {
              id: true,
              name: true,
              subdomain: true,
              createdAt: true,
              _count: { select: { users: true, clients: true } },
            },
            orderBy: { name: 'asc' },
          },
        },
      },
    },
  });

  if (!tenant) {
    throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
  }

  const group = tenant.firmGroup;
  const isOwnerPractice = Boolean(group?.ownerTenantId && group.ownerTenantId === tenantId);
  const canAdmin =
    Boolean(group) && isOwnerPractice && GROUP_ADMIN_ROLES.includes(userRole);

  return {
    assigned: Boolean(group),
    canAdmin,
    isOwnerPractice,
    firmGroup: group
      ? {
          id: group.id,
          name: group.name,
          slug: group.slug,
          ownerTenantId: group.ownerTenantId,
          practiceCount: group.tenants.length,
          createdAt: group.createdAt.toISOString(),
        }
      : null,
    practices: (group?.tenants ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      subdomain: p.subdomain,
      isOwner: p.id === group?.ownerTenantId,
      isCurrent: p.id === tenantId,
      userCount: p._count.users,
      clientCount: p._count.clients,
      joinedAt: p.createdAt.toISOString(),
    })),
    practice: {
      id: tenant.id,
      name: tenant.name,
      subdomain: tenant.subdomain,
    },
  };
}

export async function getFirmGroupContext(
  tenantId: string,
  userRole: UserRole
): Promise<FirmGroupContext> {
  return loadGroupContext(tenantId, userRole);
}

export async function createFirmGroup(
  tenantId: string,
  userRole: UserRole,
  input: { name: string; slug?: string }
): Promise<FirmGroupContext> {
  if (!GROUP_ADMIN_ROLES.includes(userRole)) {
    throw new ApiError('FORBIDDEN', 'Only practice administrators can create a firm group', 403);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, firmGroupId: true },
  });
  if (!tenant) throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
  if (tenant.firmGroupId) {
    throw new ApiError('VALIDATION_ERROR', 'This practice is already in a firm group', 400);
  }

  const baseSlug = slugify(input.slug || input.name);
  const slug = await uniqueSlug(baseSlug);

  const group = await prisma.firmGroup.create({
    data: {
      name: input.name.trim(),
      slug,
      ownerTenantId: tenantId,
      tenants: { connect: { id: tenantId } },
    },
  });

  await prisma.activityLog.create({
    data: {
      tenantId,
      action: 'FIRM_GROUP_CREATED',
      entityType: 'FIRM_GROUP',
      entityId: group.id,
      description: `Created firm group "${group.name}"`,
    },
  });

  return loadGroupContext(tenantId, userRole);
}

export async function updateFirmGroup(
  tenantId: string,
  userRole: UserRole,
  input: { name: string }
): Promise<FirmGroupContext> {
  const ctx = await loadGroupContext(tenantId, userRole);
  if (!ctx.firmGroup) {
    throw new ApiError('NOT_FOUND', 'No firm group assigned to this practice', 404);
  }
  assertGroupAdmin(userRole, tenantId, ctx.firmGroup.ownerTenantId);

  await prisma.firmGroup.update({
    where: { id: ctx.firmGroup.id },
    data: { name: input.name.trim() },
  });

  return loadGroupContext(tenantId, userRole);
}

export async function addPracticeToFirmGroup(
  tenantId: string,
  userRole: UserRole,
  subdomain: string
): Promise<FirmGroupContext> {
  const ctx = await loadGroupContext(tenantId, userRole);
  if (!ctx.firmGroup) {
    throw new ApiError('NOT_FOUND', 'No firm group assigned to this practice', 404);
  }
  assertGroupAdmin(userRole, tenantId, ctx.firmGroup.ownerTenantId);

  const target = await prisma.tenant.findFirst({
    where: { subdomain: subdomain.toLowerCase().trim(), isActive: true },
    select: { id: true, name: true, firmGroupId: true },
  });

  if (!target) {
    throw new ApiError('NOT_FOUND', `No active practice found with subdomain "${subdomain}"`, 404);
  }
  if (target.firmGroupId) {
    if (target.firmGroupId === ctx.firmGroup.id) {
      throw new ApiError('VALIDATION_ERROR', 'That practice is already in this firm group', 400);
    }
    throw new ApiError('VALIDATION_ERROR', 'That practice already belongs to another firm group', 400);
  }

  await prisma.tenant.update({
    where: { id: target.id },
    data: { firmGroupId: ctx.firmGroup.id },
  });

  await prisma.activityLog.create({
    data: {
      tenantId,
      action: 'FIRM_GROUP_PRACTICE_ADDED',
      entityType: 'FIRM_GROUP',
      entityId: ctx.firmGroup.id,
      description: `Added practice "${target.name}" to firm group`,
    },
  });

  return loadGroupContext(tenantId, userRole);
}

export async function removePracticeFromFirmGroup(
  tenantId: string,
  userRole: UserRole,
  practiceId: string
): Promise<FirmGroupContext> {
  const ctx = await loadGroupContext(tenantId, userRole);
  if (!ctx.firmGroup) {
    throw new ApiError('NOT_FOUND', 'No firm group assigned to this practice', 404);
  }
  assertGroupAdmin(userRole, tenantId, ctx.firmGroup.ownerTenantId);

  if (practiceId === ctx.firmGroup.ownerTenantId) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Cannot remove the owner practice. Transfer ownership or dissolve the group first.',
      400
    );
  }

  const member = ctx.practices.find((p) => p.id === practiceId);
  if (!member) {
    throw new ApiError('NOT_FOUND', 'Practice is not a member of this firm group', 404);
  }

  await prisma.tenant.update({
    where: { id: practiceId },
    data: { firmGroupId: null },
  });

  await prisma.activityLog.create({
    data: {
      tenantId,
      action: 'FIRM_GROUP_PRACTICE_REMOVED',
      entityType: 'FIRM_GROUP',
      entityId: ctx.firmGroup.id,
      description: `Removed practice "${member.name}" from firm group`,
    },
  });

  return loadGroupContext(tenantId, userRole);
}

export async function leaveFirmGroup(
  tenantId: string,
  userRole: UserRole
): Promise<FirmGroupContext> {
  if (!GROUP_ADMIN_ROLES.includes(userRole)) {
    throw new ApiError('FORBIDDEN', 'Only practice administrators can leave a firm group', 403);
  }

  const ctx = await loadGroupContext(tenantId, userRole);
  if (!ctx.firmGroup) {
    throw new ApiError('NOT_FOUND', 'No firm group assigned to this practice', 404);
  }
  if (ctx.isOwnerPractice) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Owner practice cannot leave. Dissolve the group or transfer ownership first.',
      400
    );
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { firmGroupId: null },
  });

  return loadGroupContext(tenantId, userRole);
}

export async function dissolveFirmGroup(
  tenantId: string,
  userRole: UserRole
): Promise<FirmGroupContext> {
  const ctx = await loadGroupContext(tenantId, userRole);
  if (!ctx.firmGroup) {
    throw new ApiError('NOT_FOUND', 'No firm group assigned to this practice', 404);
  }
  assertGroupAdmin(userRole, tenantId, ctx.firmGroup.ownerTenantId);

  const groupId = ctx.firmGroup.id;

  await prisma.tenant.updateMany({
    where: { firmGroupId: groupId },
    data: { firmGroupId: null },
  });

  await prisma.firmGroup.delete({ where: { id: groupId } });

  await prisma.activityLog.create({
    data: {
      tenantId,
      action: 'FIRM_GROUP_DISSOLVED',
      entityType: 'FIRM_GROUP',
      entityId: groupId,
      description: `Dissolved firm group "${ctx.firmGroup.name}"`,
    },
  });

  return loadGroupContext(tenantId, userRole);
}