/**
 * AML per-check metering (R2.4). The AML_CHECK_INITIATED ActivityLog row that
 * initiateAmlCheck already writes IS the usage record — this service aggregates
 * it for reporting and, when platform billing is switched on, raises a Stripe
 * invoice item per provider-backed check. Charging is OFF by default:
 *   AML_BILLING_ENABLED=true and AML_CHECK_PRICE_PENCE>0 are both required.
 */

import { prisma } from '../../config/database.js';
import { stripe } from '../../config/stripe.js';
import logger from '../../config/logger.js';
import type { AmlProvider } from './providers/types.js';

export interface AmlUsageSummary {
  month: string;
  checksByProvider: Record<string, number>;
  totalChecks: number;
  perCheckPricePence: number;
  billingEnabled: boolean;
}

export function getAmlCheckPricePence(): number {
  const raw = Number.parseInt(process.env.AML_CHECK_PRICE_PENCE || '0', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export function isAmlBillingEnabled(): boolean {
  return process.env.AML_BILLING_ENABLED === 'true';
}

function monthWindow(month?: string): { month: string; start: Date; end: Date } {
  let year: number;
  let monthIndex: number;
  if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    year = Number(month.slice(0, 4));
    monthIndex = Number(month.slice(5)) - 1;
  } else {
    const now = new Date();
    year = now.getFullYear();
    monthIndex = now.getMonth();
  }
  return {
    month: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
    start: new Date(year, monthIndex, 1),
    end: new Date(year, monthIndex + 1, 1),
  };
}

/**
 * Provider-backed AML checks for the month (stub/demo checks excluded),
 * aggregated from AML_CHECK_INITIATED activity logs. `month` is `YYYY-MM`;
 * defaults to the current month.
 */
export async function getAmlUsage(tenantId: string, month?: string): Promise<AmlUsageSummary> {
  const window = monthWindow(month);

  const logs = await prisma.activityLog.findMany({
    where: {
      tenantId,
      action: 'AML_CHECK_INITIATED',
      createdAt: { gte: window.start, lt: window.end },
    },
    select: { metadata: true },
  });

  const checksByProvider: Record<string, number> = {};
  let totalChecks = 0;

  for (const log of logs) {
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(log.metadata || '{}') as Record<string, unknown>;
    } catch {
      /* treat as empty */
    }

    const provider = typeof meta.provider === 'string' ? meta.provider : null;
    if (!provider || provider === 'stub' || meta.isStub === true) continue;

    checksByProvider[provider] = (checksByProvider[provider] || 0) + 1;
    totalChecks++;
  }

  return {
    month: window.month,
    checksByProvider,
    totalChecks,
    perCheckPricePence: getAmlCheckPricePence(),
    billingEnabled: isAmlBillingEnabled(),
  };
}

/**
 * Billing hook per successful provider-backed check. The usage record itself is
 * the AML_CHECK_INITIATED ActivityLog row (no double-write here). When billing
 * is enabled AND a per-check price is set, this creates a Stripe invoice item
 * against the tenant's platform-billing Stripe customer (Tenant.stripeCustomerId,
 * created by the platform subscription flow in routes/payments.ts). Never
 * throws — a billing failure must not fail the AML check.
 */
export async function recordAmlCheckUsage(
  tenantId: string,
  provider: AmlProvider,
  clientId: string
): Promise<void> {
  if (provider === 'stub') return;

  const pricePence = getAmlCheckPricePence();
  if (!isAmlBillingEnabled() || pricePence <= 0) return;

  try {
    if (!stripe) {
      logger.warn(
        `AML billing NOT_CONFIGURED: STRIPE_SECRET_KEY missing — skipped invoice item for tenant ${tenantId}`
      );
      return;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { stripeCustomerId: true },
    });

    if (!tenant?.stripeCustomerId) {
      logger.warn(
        `AML billing NOT_CONFIGURED: tenant ${tenantId} has no platform Stripe customer — skipped invoice item`
      );
      return;
    }

    await stripe.invoiceItems.create({
      customer: tenant.stripeCustomerId,
      amount: pricePence,
      currency: 'gbp',
      description: `AML check (${provider})`,
      metadata: { tenantId, clientId, provider, feature: 'aml_check' },
    });

    logger.info(
      `AML check invoice item created for tenant ${tenantId} (${provider}, ${pricePence}p)`
    );
  } catch (err) {
    logger.error(`AML billing invoice item failed for tenant ${tenantId}`, err);
  }
}
