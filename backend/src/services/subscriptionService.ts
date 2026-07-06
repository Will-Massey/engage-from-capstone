import { prisma } from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';

const TRIAL_DAYS = parseInt(process.env.STRIPE_TRIAL_DAYS || '14', 10);

const PAID_ACTIVE_STATUSES = new Set(['active']);

const BLOCKED_STATUSES = new Set([
  'past_due',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'cancelled',
  'canceled',
]);

export const TRIAL_EXPIRED_MESSAGE =
  'Your 14-day free trial has ended. To continue sending proposals to clients, please subscribe to a plan in Settings → Subscription.';

export const SUBSCRIPTION_INACTIVE_MESSAGE =
  'Your subscription is not active. Please update your billing details in Settings → Subscription before sending proposals.';

export interface TenantBillingSnapshot {
  id: string;
  createdAt: Date;
  settings: string;
  subscriptionStatus: string | null;
  stripeSubscriptionId: string | null;
}

export function parseTenantSettings(
  settings: string | Record<string, unknown>
): Record<string, unknown> {
  if (typeof settings === 'object' && settings !== null && !Array.isArray(settings)) {
    return settings;
  }
  if (typeof settings === 'string') {
    try {
      return JSON.parse(settings || '{}') as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

export function getTrialEndsAt(
  tenant: Pick<TenantBillingSnapshot, 'createdAt' | 'settings'>
): Date {
  const settings = parseTenantSettings(tenant.settings);
  if (typeof settings.trialEndsAt === 'string') {
    const parsed = new Date(settings.trialEndsAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  const fallback = new Date(tenant.createdAt);
  fallback.setDate(fallback.getDate() + TRIAL_DAYS);
  return fallback;
}

export function evaluateTenantBilling(tenant: TenantBillingSnapshot): {
  allowed: boolean;
  code?: string;
  message?: string;
  trialEndsAt?: Date;
  daysRemaining?: number;
} {
  if (process.env.BYPASS_SUBSCRIPTION_ENFORCEMENT === 'true') {
    return { allowed: true };
  }

  const status = (tenant.subscriptionStatus || '').toLowerCase();
  const trialEndsAt = getTrialEndsAt(tenant);
  const now = new Date();
  const msRemaining = trialEndsAt.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

  if (PAID_ACTIVE_STATUSES.has(status)) {
    return { allowed: true, trialEndsAt, daysRemaining: 0 };
  }

  if (BLOCKED_STATUSES.has(status)) {
    return {
      allowed: false,
      code: 'SUBSCRIPTION_INACTIVE',
      message: SUBSCRIPTION_INACTIVE_MESSAGE,
      trialEndsAt,
      daysRemaining,
    };
  }

  if (now <= trialEndsAt) {
    return { allowed: true, trialEndsAt, daysRemaining };
  }

  return {
    allowed: false,
    code: 'TRIAL_EXPIRED',
    message: TRIAL_EXPIRED_MESSAGE,
    trialEndsAt,
    daysRemaining: 0,
  };
}

export async function assertTenantCanSendProposals(tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      createdAt: true,
      settings: true,
      subscriptionStatus: true,
      stripeSubscriptionId: true,
    },
  });

  if (!tenant) {
    throw new ApiError('TENANT_NOT_FOUND', 'Practice account not found', 404);
  }

  const result = evaluateTenantBilling(tenant);
  if (!result.allowed) {
    throw new ApiError(
      result.code || 'SUBSCRIPTION_REQUIRED',
      result.message || TRIAL_EXPIRED_MESSAGE,
      402
    );
  }
}

export function buildTrialSettings(existingSettings?: Record<string, unknown> | string): {
  settingsJson: string;
  subscriptionStatus: string;
} {
  const parsed =
    typeof existingSettings === 'string'
      ? parseTenantSettings(existingSettings)
      : { ...(existingSettings || {}) };

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

  return {
    settingsJson: JSON.stringify({
      ...parsed,
      trialEndsAt: trialEndsAt.toISOString(),
    }),
    subscriptionStatus: 'trialing',
  };
}
