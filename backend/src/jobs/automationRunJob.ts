/**
 * Daily scheduled execution of tenant automation rules.
 *
 * OPT-IN per tenant (settings.automationSchedule === 'daily', default off):
 * tenants configured their rules expecting manual runs — silently activating
 * daily client-facing chase emails is the chaseSequenceEnabled near-miss.
 * Scheduled runs pass a 3-day cooldown so a persistent trigger condition
 * (e.g. an overdue job) cannot re-fire the same client-facing action daily.
 */
import { prisma } from '../config/database.js';
import logger from '../config/logger.js';
import { runAutomationRules } from '../services/automationRulesService.js';

const COOLDOWN_DAYS = 3;

export async function runScheduledAutomations(): Promise<{
  tenantsRun: number;
  totalActed: number;
}> {
  // settings is a JSON string column — string match is the available filter.
  const tenants = await prisma.tenant.findMany({
    where: {
      isActive: true,
      settings: { contains: '"automationSchedule":"daily"' },
    },
    select: { id: true, name: true },
  });

  let totalActed = 0;
  for (const tenant of tenants) {
    try {
      const { results } = await runAutomationRules(tenant.id, {
        cooldownDays: COOLDOWN_DAYS,
      });
      const acted = results.reduce((s, r) => s + r.acted, 0);
      const skipped = results.reduce((s, r) => s + r.skippedCooldown, 0);
      totalActed += acted;

      // Per-run summary row — visible even when nothing acted, so a quiet
      // schedule is auditable (July lesson: silent automation is dangerous).
      await prisma.activityLog.create({
        data: {
          action: 'AUTOMATION_SCHEDULED_RUN',
          entityType: 'Tenant',
          entityId: tenant.id,
          description: `Scheduled automation run: ${results.length} rules, ${acted} actions, ${skipped} cooldown-skipped`,
          metadata: JSON.stringify({
            rules: results.length,
            acted,
            skippedCooldown: skipped,
            cooldownDays: COOLDOWN_DAYS,
          }),
          tenantId: tenant.id,
        },
      });
    } catch (e) {
      logger.error(`Scheduled automation run failed for tenant ${tenant.id}`, e);
    }
  }

  if (tenants.length > 0) {
    logger.info(
      `Scheduled automations: ${tenants.length} tenant(s), ${totalActed} action(s) total`
    );
  }
  return { tenantsRun: tenants.length, totalActed };
}
