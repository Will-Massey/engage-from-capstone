/**
 * Phase 5 stub — regulatory change watcher.
 * Flags live proposals that may need review when MTD / Companies Act rules shift.
 */
import { prisma } from '../../config/database.js';
import { logAiUsage } from './proposalAiService.js';

export interface RegulatoryAlert {
  id: string;
  ruleCode: string;
  title: string;
  summary: string;
  severity: 'info' | 'warning' | 'critical';
  affectedProposalCount: number;
  effectiveFrom?: string;
}

const WATCHLIST: Array<Omit<RegulatoryAlert, 'id' | 'affectedProposalCount'>> = [
  {
    ruleCode: 'MTD-ITSA-2026',
    title: 'Making Tax Digital for Income Tax',
    summary:
      'Clients with sole trader or property income may need MTD-compatible software from April 2026. Review proposals missing MTD clauses.',
    severity: 'warning',
    effectiveFrom: '2026-04-06',
  },
  {
    ruleCode: 'COMPANIES-ACT-FILING',
    title: 'Companies House filing deadlines',
    summary:
      'Annual accounts proposals should reference the correct filing window for the client company type.',
    severity: 'info',
  },
];

/** Scan tenant proposals for regulatory fit gaps (rule-based stub; AI enrichment later). */
export async function getRegulatoryAlerts(
  tenantId: string,
  userId?: string
): Promise<{ alerts: RegulatoryAlert[]; scannedAt: string }> {
  const activeStatuses = ['DRAFT', 'SENT', 'VIEWED'] as const;

  const proposals = await prisma.proposal.findMany({
    where: { tenantId, status: { in: [...activeStatuses] } },
    select: {
      id: true,
      client: { select: { mtditsaStatus: true, companyType: true } },
      services: { select: { name: true } },
    },
  });

  const mtdRequiredStatuses = new Set([
    'MANDATORY',
    'REQUIRED_2026',
    'REQUIRED_2027',
    'REQUIRED_2028',
    'OPTED_IN',
  ]);

  const mtdGapCount = proposals.filter((p) => {
    const needsMtd = mtdRequiredStatuses.has(p.client.mtditsaStatus);
    const hasMtdService = p.services.some((s) => /mtd|making tax digital/i.test(s.name));
    return needsMtd && !hasMtdService;
  }).length;

  const accountsGapCount = proposals.filter((p) => {
    const isLtd = /limited/i.test(p.client.companyType || '');
    const hasAccounts = p.services.some((s) => /annual accounts|statutory accounts/i.test(s.name));
    return isLtd && !hasAccounts;
  }).length;

  const alerts: RegulatoryAlert[] = WATCHLIST.map((rule, i) => ({
    ...rule,
    id: `reg-${rule.ruleCode}`,
    affectedProposalCount:
      rule.ruleCode === 'MTD-ITSA-2026'
        ? mtdGapCount
        : rule.ruleCode === 'COMPANIES-ACT-FILING'
          ? accountsGapCount
          : 0,
  })).filter((a) => a.affectedProposalCount > 0 || a.severity !== 'info');

  await logAiUsage(tenantId, userId, 'regulatory_watcher', {
    alertCount: alerts.length,
    proposalCount: proposals.length,
  });

  return { alerts, scannedAt: new Date().toISOString() };
}