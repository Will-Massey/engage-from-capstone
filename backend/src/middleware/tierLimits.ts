/**
 * Subscription tier limits and trial expiry enforcement.
 * Limits sourced from SUBSCRIPTION_TIERS in config/stripe.ts.
 */
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database.js';
import { SUBSCRIPTION_TIERS } from '../config/stripe.js';
import { ApiError, asyncHandler } from './errorHandler.js';

export type SubscriptionTierKey = keyof typeof SUBSCRIPTION_TIERS;
export type TierLimitResource = 'users' | 'clients' | 'proposals';

const PAID_STATUSES = new Set(['active', 'ACTIVE', 'trialing', 'TRIALING']);

function resolveTierKey(tier: string | null | undefined): SubscriptionTierKey {
  const normalised = (tier || 'STARTER').toUpperCase().replace(/_ANNUAL$/, '');
  if (normalised in SUBSCRIPTION_TIERS) {
    return normalised as SubscriptionTierKey;
  }
  return 'STARTER';
}

function isUnlimited(value: number | string): boolean {
  return value === 'Unlimited' || value === -1;
}

function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

export function tenantHasPaidSubscription(tenant: {
  subscriptionStatus: string | null;
  stripeSubscriptionId: string | null;
  trialEndsAt?: Date | null;
}): boolean {
  if (tenant.stripeSubscriptionId) return true;
  if (tenant.subscriptionStatus && PAID_STATUSES.has(tenant.subscriptionStatus)) {
    return true;
  }
  return false;
}

export function tenantTrialIsActive(tenant: {
  subscriptionStatus: string | null;
  trialEndsAt?: Date | null;
}): boolean {
  if (tenant.subscriptionStatus !== 'trial') return false;
  if (!tenant.trialEndsAt) return true;
  return tenant.trialEndsAt > new Date();
}

/**
 * Block proposal send when trial has expired and the practice has not subscribed.
 */
export const requireActiveSubscriptionOrTrial = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new ApiError('TENANT_REQUIRED', 'Practice context is required.', 403);
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        subscriptionStatus: true,
        stripeSubscriptionId: true,
        trialEndsAt: true,
      },
    });

    if (!tenant) {
      throw new ApiError('TENANT_NOT_FOUND', 'Practice not found.', 404);
    }

    if (tenantHasPaidSubscription(tenant)) {
      return next();
    }

    if (tenantTrialIsActive(tenant)) {
      return next();
    }

    if (tenant.subscriptionStatus === 'trial') {
      throw new ApiError(
        'TRIAL_EXPIRED',
        'Your 14-day trial has ended. Please subscribe to continue sending proposals.',
        403
      );
    }

    throw new ApiError(
      'SUBSCRIPTION_REQUIRED',
      'An active subscription is required to send proposals. Please upgrade your plan.',
      403
    );
  }
);

/**
 * Enforce SUBSCRIPTION_TIERS limits on user, client, and proposal creation.
 */
export function enforceTierLimit(resource: TierLimitResource) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new ApiError('TENANT_REQUIRED', 'Practice context is required.', 403);
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { subscriptionTier: true },
    });

    const tierKey = resolveTierKey(tenant?.subscriptionTier);
    const tier = SUBSCRIPTION_TIERS[tierKey];

    if (resource === 'users') {
      const maxUsers = tier.maxUsers;
      if (!isUnlimited(maxUsers)) {
        const count = await prisma.user.count({
          where: { tenantId, isActive: true },
        });
        if (count >= (maxUsers as number)) {
          throw new ApiError(
            'TIER_LIMIT_USERS',
            `Your ${tier.name} plan allows up to ${maxUsers} team members. Please upgrade to add more users.`,
            402
          );
        }
      }
    }

    if (resource === 'clients') {
      const maxClients = tier.maxClients;
      if (!isUnlimited(maxClients)) {
        const count = await prisma.client.count({
          where: { tenantId, isActive: true },
        });
        if (count >= (maxClients as number)) {
          throw new ApiError(
            'TIER_LIMIT_CLIENTS',
            `Your ${tier.name} plan allows up to ${maxClients} clients. Please upgrade to add more clients.`,
            402
          );
        }
      }
    }

    if (resource === 'proposals') {
      const maxProposals = tier.maxProposals;
      if (!isUnlimited(maxProposals)) {
        const count = await prisma.proposal.count({
          where: {
            tenantId,
            createdAt: { gte: startOfCurrentMonth() },
          },
        });
        if (count >= (maxProposals as number)) {
          throw new ApiError(
            'TIER_LIMIT_PROPOSALS',
            `Your ${tier.name} plan allows up to ${maxProposals} proposals per month. Please upgrade for unlimited proposals.`,
            402
          );
        }
      }
    }

    next();
  });
}