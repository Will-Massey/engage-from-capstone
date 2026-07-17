/**
 * Nightly Clara agentic drafting job (R5.1) — runs the per-tenant drafting
 * pass for every active tenant. The service itself no-ops for tenants that
 * have not opted in (clara.agenticDraftingEnabled, default OFF), so the job is
 * safe to run everywhere. Per-tenant failures are isolated.
 */
import { prisma } from '../config/database.js';
import logger from '../config/logger.js';
import { runClaraDraftingForTenant } from '../services/claraAgenticService.js';

export interface ClaraAgenticDraftingResult {
  tenants: number;
  signalDrafts: number;
  renewalDrafts: number;
  skipped: number;
  errors: number;
}

export async function runClaraAgenticDrafting(
  now: Date = new Date()
): Promise<ClaraAgenticDraftingResult> {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  const totals: ClaraAgenticDraftingResult = {
    tenants: 0,
    signalDrafts: 0,
    renewalDrafts: 0,
    skipped: 0,
    errors: 0,
  };

  for (const tenant of tenants) {
    try {
      const result = await runClaraDraftingForTenant(tenant.id, now);
      totals.tenants += 1;
      totals.signalDrafts += result.signalDrafts;
      totals.renewalDrafts += result.renewalDrafts;
      totals.skipped += result.skipped;
      totals.errors += result.errors;
    } catch (err) {
      totals.errors += 1;
      logger.error(`Clara agentic drafting failed for tenant ${tenant.id}:`, err);
    }
  }

  logger.info(
    `🤖 Clara agentic drafting complete — ${totals.tenants} tenants, ${totals.signalDrafts} signal drafts, ${totals.renewalDrafts} renewal drafts, ${totals.skipped} skipped, ${totals.errors} errors`
  );
  return totals;
}
