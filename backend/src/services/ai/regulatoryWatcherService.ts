/**
 * Regulatory change watcher — surfaces affected live proposals via regulatoryFitService.
 */
import { logAiUsage } from './proposalAiService.js';
import { scanTenantRegulatoryAlerts } from '../regulatoryFitService.js';

export interface RegulatoryAlert {
  id: string;
  ruleCode: string;
  title: string;
  summary: string;
  severity: 'info' | 'warning' | 'critical';
  affectedProposalCount: number;
  effectiveFrom?: string;
  proposalIds?: string[];
}

/** Scan tenant proposals for regulatory fit gaps. */
export async function getRegulatoryAlerts(
  tenantId: string,
  userId?: string
): Promise<{ alerts: RegulatoryAlert[]; scannedAt: string; proposalCount: number }> {
  const result = await scanTenantRegulatoryAlerts(tenantId);

  await logAiUsage(tenantId, userId, 'regulatory_watcher', {
    alertCount: result.alerts.length,
    proposalCount: result.proposalCount,
  });

  return result;
}