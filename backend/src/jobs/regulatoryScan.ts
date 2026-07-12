/**
 * Nightly regulatory scan (R5.2) — evaluates the deterministic rule engine for
 * every active client and reconciles results with persisted RegulatorySignal
 * rows:
 *   - newly firing rule                → upsert OPEN (+ ActivityLog REGULATORY_SIGNAL_RAISED)
 *   - still firing                     → bump lastEvaluatedAt only
 *   - no longer firing (OPEN/DISMISSED/ACTIONED) → status RESOLVED + resolvedAt
 *   - RESOLVED then fires again        → fresh occurrence: back to OPEN
 *   - DISMISSED stays dismissed while the rule keeps firing
 *
 * No AI/LLM calls — signal copy comes straight from the rule definitions.
 */
import { prisma } from '../config/database.js';
import logger from '../config/logger.js';
import { getRegulatorySettings } from '../utils/tenantRegulatorySettings.js';
import { evaluateClientRules, type RegulatoryRule } from '../services/regulatoryRules.js';
import { getEngagedServicesByClient } from '../services/engagedServices.js';

export interface TenantScanResult {
  tenantId: string;
  clientsEvaluated: number;
  raised: number;
  resolved: number;
  stillFiring: number;
}

export interface RegulatoryScanResult {
  tenants: number;
  clientsEvaluated: number;
  raised: number;
  resolved: number;
}

function ruleMetadata(rule: RegulatoryRule): string {
  return JSON.stringify({
    category: rule.category,
    threshold: rule.threshold,
    effectiveFrom: rule.effectiveFrom,
    source: rule.source,
  });
}

async function logSignalRaised(
  tenantId: string,
  clientId: string,
  rule: RegulatoryRule
): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        tenantId,
        action: 'REGULATORY_SIGNAL_RAISED',
        entityType: 'CLIENT',
        entityId: clientId,
        description: rule.title,
        metadata: JSON.stringify({ ruleId: rule.id, family: rule.family, severity: rule.severity }),
      },
    });
  } catch (err) {
    logger.warn('Failed to log regulatory signal raise', err);
  }
}

/**
 * Evaluate + reconcile all active clients of one tenant.
 * Batched: one client query, one accepted-proposal-services query, one signal
 * query per tenant — no per-client reads.
 */
export async function scanTenantRegulatorySignals(
  tenantId: string,
  tenantSettingsJson?: string | null,
  now: Date = new Date()
): Promise<TenantScanResult> {
  let settingsJson = tenantSettingsJson;
  if (settingsJson === undefined) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    settingsJson = tenant?.settings ?? null;
  }
  const settings = getRegulatorySettings(settingsJson);

  const clients = await prisma.client.findMany({
    where: { tenantId, isActive: true },
    select: {
      id: true,
      companyType: true,
      turnover: true,
      mtditsaIncome: true,
      mtditsaStatus: true,
      vatRegistered: true,
      employeeCount: true,
      nextVatDueDate: true,
      nextAccountsDueDate: true,
      nextConfirmationStatementDue: true,
    },
  });

  const engagedByClient = await getEngagedServicesByClient(
    tenantId,
    clients.map((c) => c.id)
  );

  const existingSignals = await prisma.regulatorySignal.findMany({ where: { tenantId } });
  const existingByKey = new Map(existingSignals.map((s) => [`${s.clientId}:${s.ruleId}`, s]));

  const firingByKey = new Map<string, { clientId: string; rule: RegulatoryRule }>();
  for (const client of clients) {
    const rules = evaluateClientRules(client, engagedByClient.get(client.id) ?? [], settings, now);
    for (const rule of rules) {
      firingByKey.set(`${client.id}:${rule.id}`, { clientId: client.id, rule });
    }
  }

  let raised = 0;
  let resolved = 0;
  let stillFiring = 0;

  for (const [key, { clientId, rule }] of firingByKey) {
    const existing = existingByKey.get(key);

    if (!existing) {
      await prisma.regulatorySignal.create({
        data: {
          tenantId,
          clientId,
          ruleId: rule.id,
          family: rule.family,
          severity: rule.severity,
          title: rule.title,
          detail: rule.description,
          metadata: ruleMetadata(rule),
          status: 'OPEN',
          firstRaisedAt: now,
          lastEvaluatedAt: now,
        },
      });
      await logSignalRaised(tenantId, clientId, rule);
      raised += 1;
      continue;
    }

    if (existing.status === 'RESOLVED') {
      // Fresh occurrence after a resolution — reopen with a clean slate.
      await prisma.regulatorySignal.update({
        where: { id: existing.id },
        data: {
          status: 'OPEN',
          family: rule.family,
          severity: rule.severity,
          title: rule.title,
          detail: rule.description,
          metadata: ruleMetadata(rule),
          firstRaisedAt: now,
          lastEvaluatedAt: now,
          resolvedAt: null,
          dismissedAt: null,
          dismissedByUserId: null,
        },
      });
      await logSignalRaised(tenantId, clientId, rule);
      raised += 1;
      continue;
    }

    // OPEN / DISMISSED / ACTIONED and still firing — bump the evaluation stamp only.
    await prisma.regulatorySignal.update({
      where: { id: existing.id },
      data: { lastEvaluatedAt: now },
    });
    stillFiring += 1;
  }

  for (const existing of existingSignals) {
    if (existing.status === 'RESOLVED') continue;
    if (firingByKey.has(`${existing.clientId}:${existing.ruleId}`)) continue;

    await prisma.regulatorySignal.update({
      where: { id: existing.id },
      data: { status: 'RESOLVED', resolvedAt: now, lastEvaluatedAt: now },
    });
    resolved += 1;
  }

  return { tenantId, clientsEvaluated: clients.length, raised, resolved, stillFiring };
}

/** Job entry point — scan every active tenant (called nightly under job lock). */
export async function runRegulatoryScan(now: Date = new Date()): Promise<RegulatoryScanResult> {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true, settings: true },
  });

  const totals: RegulatoryScanResult = { tenants: 0, clientsEvaluated: 0, raised: 0, resolved: 0 };

  for (const tenant of tenants) {
    try {
      const result = await scanTenantRegulatorySignals(tenant.id, tenant.settings, now);
      totals.tenants += 1;
      totals.clientsEvaluated += result.clientsEvaluated;
      totals.raised += result.raised;
      totals.resolved += result.resolved;
    } catch (err) {
      logger.error(`Regulatory scan failed for tenant ${tenant.id}:`, err);
    }
  }

  logger.info(
    `🔎 Regulatory scan complete — ${totals.tenants} tenants, ${totals.clientsEvaluated} clients, ${totals.raised} raised, ${totals.resolved} resolved`
  );
  return totals;
}
