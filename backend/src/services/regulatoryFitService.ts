/**
 * UK regulatory fit rule engine — MTD clauses, AML blocks, pricing floors.
 * Used by proposal regulatory-fit endpoint, pricing advisor, and regulatory watcher.
 */
import { MTDITSAStatus } from '@prisma/client';
import { prisma } from '../config/database.js';

export type RegulatorySeverity = 'info' | 'warning' | 'critical';

export interface RegulatoryFitAlert {
  id: string;
  code: string;
  title: string;
  message: string;
  severity: RegulatorySeverity;
  suggestion?: string;
}

export interface PricingAdvisorFlag {
  serviceId: string;
  serviceName: string;
  quotedPrice: number;
  floorPrice: number;
  turnoverBand: TurnoverBand;
  message: string;
}

export type TurnoverBand = 'UNKNOWN' | 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE';

const MTD_REQUIRED_STATUSES: MTDITSAStatus[] = [
  MTDITSAStatus.MANDATORY,
  MTDITSAStatus.REQUIRED_2026,
  MTDITSAStatus.REQUIRED_2027,
];

const MTD_TERMS_PATTERNS = [
  /making tax digital/i,
  /\bmtd\b/i,
  /mtd\s+itsa/i,
  /digital record.?keeping/i,
  /quarterly update/i,
];

const AML_TERMS_PATTERNS = [
  /\baml\b/i,
  /anti.?money laundering/i,
  /money laundering regulations/i,
  /client due diligence/i,
  /know your customer/i,
  /\bkyc\b/i,
];

const MTD_SERVICE_PATTERNS = /mtd|making tax digital/i;
const AML_SERVICE_PATTERNS = /aml|anti.?money laundering|client onboarding/i;

export function getTurnoverBand(turnover?: number | null): TurnoverBand {
  if (turnover == null || !Number.isFinite(turnover) || turnover <= 0) return 'UNKNOWN';
  if (turnover < 50_000) return 'MICRO';
  if (turnover < 200_000) return 'SMALL';
  if (turnover < 1_000_000) return 'MEDIUM';
  return 'LARGE';
}

/** Band multiplier applied to catalog basePrice to derive minimum fee floor */
export function getTurnoverBandMultiplier(band: TurnoverBand): number {
  switch (band) {
    case 'MICRO':
      return 0.85;
    case 'SMALL':
      return 1.0;
    case 'MEDIUM':
      return 1.12;
    case 'LARGE':
      return 1.25;
    default:
      return 1.0;
  }
}

function textHasPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function hasMtdCoverage(terms: string, engagementLetter: string, serviceNames: string[]): boolean {
  const combined = [terms, engagementLetter, ...serviceNames].filter(Boolean).join('\n');
  if (textHasPattern(combined, MTD_TERMS_PATTERNS)) return true;
  return serviceNames.some((n) => MTD_SERVICE_PATTERNS.test(n));
}

function hasAmlCoverage(terms: string, engagementLetter: string, serviceNames: string[]): boolean {
  const combined = [terms, engagementLetter, ...serviceNames].filter(Boolean).join('\n');
  if (textHasPattern(combined, AML_TERMS_PATTERNS)) return true;
  return serviceNames.some((n) => AML_SERVICE_PATTERNS.test(n));
}

function isNewClient(
  proposalCount: number,
  amlCompletedAt: Date | null,
  createdAt: Date
): boolean {
  const daysSinceCreated = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  return proposalCount <= 1 && !amlCompletedAt && daysSinceCreated <= 90;
}

export interface ProposalRegulatoryInput {
  client: {
    id: string;
    name: string;
    mtditsaStatus: MTDITSAStatus;
    turnover?: number | null;
    amlCompletedAt?: Date | null;
    createdAt: Date;
    _count?: { proposals: number };
  };
  terms?: string | null;
  engagementLetter?: string | null;
  coverLetter?: string | null;
  services: Array<{ name: string }>;
}

/** Evaluate regulatory fit for a single proposal (saved or draft-shaped). */
export function evaluateProposalRegulatoryFit(input: ProposalRegulatoryInput): RegulatoryFitAlert[] {
  const alerts: RegulatoryFitAlert[] = [];
  const terms = input.terms || '';
  const engagementLetter = input.engagementLetter || '';
  const coverLetter = input.coverLetter || '';
  const serviceNames = input.services.map((s) => s.name);
  const proposalCount = input.client._count?.proposals ?? 1;

  if (MTD_REQUIRED_STATUSES.includes(input.client.mtditsaStatus)) {
    const combinedTerms = `${terms}\n${engagementLetter}\n${coverLetter}`;
    if (!hasMtdCoverage(combinedTerms, engagementLetter, serviceNames)) {
      alerts.push({
        id: 'mtd-clause-missing',
        code: 'MTD_CLAUSE_MISSING',
        title: 'MTD clause required',
        message: `${input.client.name} has MTD ITSA status ${input.client.mtditsaStatus.replace(/_/g, ' ')}. The proposal terms or services should reference Making Tax Digital obligations.`,
        severity: 'warning',
        suggestion:
          'Add an MTD ITSA service line or include a standard MTD clause in the engagement letter terms. Clara can draft this when you generate the engagement letter.',
      });
    }
  }

  if (
    isNewClient(proposalCount, input.client.amlCompletedAt ?? null, input.client.createdAt)
  ) {
    if (!hasAmlCoverage(terms, engagementLetter, serviceNames)) {
      alerts.push({
        id: 'aml-block-suggested',
        code: 'AML_BLOCK_SUGGESTED',
        title: 'AML engagement block suggested',
        message: `${input.client.name} appears to be a new client. UK AML regulations require client due diligence before engagement.`,
        severity: 'info',
        suggestion:
          'Include an AML / client onboarding section in your terms, or add an AML onboarding service. The automated lifecycle will prompt AML completion after signing.',
      });
    }
  }

  return alerts;
}

/** GET /api/proposals/:id/regulatory-fit */
export async function getProposalRegulatoryFit(tenantId: string, proposalId: string) {
  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId },
    include: {
      client: {
        include: { _count: { select: { proposals: true } } },
      },
      services: { select: { name: true } },
    },
  });

  if (!proposal) {
    return null;
  }

  const alerts = evaluateProposalRegulatoryFit({
    client: proposal.client,
    terms: proposal.terms,
    engagementLetter: proposal.engagementLetter,
    coverLetter: proposal.coverLetter,
    services: proposal.services,
  });

  return {
    proposalId: proposal.id,
    clientId: proposal.clientId,
    clientName: proposal.client.name,
    mtditsaStatus: proposal.client.mtditsaStatus,
    turnoverBand: getTurnoverBand(proposal.client.turnover),
    alerts,
    scannedAt: new Date().toISOString(),
  };
}

export interface PricingAdvisorLineInput {
  serviceId: string;
  name?: string;
  displayPrice: number;
}

/** POST /api/ai/pricing-advisor — compare quoted fees to catalog floors by turnover band */
export async function advisePricing(
  tenantId: string,
  clientId: string,
  lineItems: PricingAdvisorLineInput[]
): Promise<{
  clientId: string;
  turnoverBand: TurnoverBand;
  flags: PricingAdvisorFlag[];
  summary: string;
}> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId },
    select: { id: true, name: true, turnover: true },
  });

  if (!client) {
    throw new Error('Client not found');
  }

  const band = getTurnoverBand(client.turnover);
  const multiplier = getTurnoverBandMultiplier(band);
  const serviceIds = lineItems.map((l) => l.serviceId);

  const templates = await prisma.serviceTemplate.findMany({
    where: { id: { in: serviceIds }, tenantId },
    select: { id: true, name: true, basePrice: true, priceAmount: true },
  });

  const templateMap = new Map(templates.map((t) => [t.id, t]));
  const flags: PricingAdvisorFlag[] = [];

  for (const line of lineItems) {
    const template = templateMap.get(line.serviceId);
    if (!template) continue;

    const catalogBase = template.priceAmount > 0 ? template.priceAmount : template.basePrice;
    const floorPrice = Math.round(catalogBase * multiplier * 100) / 100;

    if (line.displayPrice < floorPrice) {
      const bandLabel =
        band === 'UNKNOWN' ? 'your standard rate card' : `${band.toLowerCase()} turnover band`;
      flags.push({
        serviceId: line.serviceId,
        serviceName: line.name || template.name,
        quotedPrice: line.displayPrice,
        floorPrice,
        turnoverBand: band,
        message: `${line.name || template.name} is quoted at £${line.displayPrice.toLocaleString('en-GB')} — below the £${floorPrice.toLocaleString('en-GB')} floor for the ${bandLabel}.`,
      });
    }
  }

  const summary =
    flags.length === 0
      ? `All ${lineItems.length} line item${lineItems.length === 1 ? '' : 's'} meet catalog floors for the ${band === 'UNKNOWN' ? 'default' : band.toLowerCase()} turnover band.`
      : `${flags.length} fee${flags.length === 1 ? '' : 's'} below recommended floor${flags.length === 1 ? '' : 's'} for ${client.name}. Review before sending.`;

  return {
    clientId: client.id,
    turnoverBand: band,
    flags,
    summary,
  };
}

export interface TenantRegulatoryScanAlert {
  id: string;
  ruleCode: string;
  title: string;
  summary: string;
  severity: RegulatorySeverity;
  affectedProposalCount: number;
  effectiveFrom?: string;
  proposalIds?: string[];
}

/** Scan all active tenant proposals for regulatory gaps (powers regulatory watcher). */
export async function scanTenantRegulatoryAlerts(tenantId: string): Promise<{
  alerts: TenantRegulatoryScanAlert[];
  scannedAt: string;
  proposalCount: number;
}> {
  const activeStatuses = ['DRAFT', 'SENT', 'VIEWED'] as const;

  const proposals = await prisma.proposal.findMany({
    where: { tenantId, status: { in: [...activeStatuses] } },
    select: {
      id: true,
      terms: true,
      engagementLetter: true,
      coverLetter: true,
      client: {
        select: {
          id: true,
          name: true,
          mtditsaStatus: true,
          turnover: true,
          amlCompletedAt: true,
          createdAt: true,
          companyType: true,
          _count: { select: { proposals: true } },
        },
      },
      services: { select: { name: true } },
    },
  });

  const mtdGapIds: string[] = [];
  const amlGapIds: string[] = [];
  const accountsGapIds: string[] = [];

  for (const p of proposals) {
    const fitAlerts = evaluateProposalRegulatoryFit({
      client: { ...p.client, _count: p.client._count },
      terms: p.terms,
      engagementLetter: p.engagementLetter,
      coverLetter: p.coverLetter,
      services: p.services,
    });

    if (fitAlerts.some((a) => a.code === 'MTD_CLAUSE_MISSING')) mtdGapIds.push(p.id);
    if (fitAlerts.some((a) => a.code === 'AML_BLOCK_SUGGESTED')) amlGapIds.push(p.id);

    const isLtd = /limited/i.test(p.client.companyType || '');
    const hasAccounts = p.services.some((s) => /annual accounts|statutory accounts/i.test(s.name));
    if (isLtd && !hasAccounts) accountsGapIds.push(p.id);
  }

  const alerts: TenantRegulatoryScanAlert[] = [];

  if (mtdGapIds.length > 0) {
    alerts.push({
      id: 'reg-MTD-ITSA-2026',
      ruleCode: 'MTD-ITSA-2026',
      title: 'Making Tax Digital for Income Tax',
      summary:
        'Clients with mandatory or upcoming MTD ITSA status have live proposals missing MTD clauses or services. Review before sending.',
      severity: 'warning',
      effectiveFrom: '2026-04-06',
      affectedProposalCount: mtdGapIds.length,
      proposalIds: mtdGapIds.slice(0, 20),
    });
  }

  if (amlGapIds.length > 0) {
    alerts.push({
      id: 'reg-AML-NEW-CLIENT',
      ruleCode: 'AML-NEW-CLIENT',
      title: 'AML blocks for new clients',
      summary:
        'New-client proposals may be missing AML / client due diligence wording. Add an engagement block before onboarding.',
      severity: 'info',
      affectedProposalCount: amlGapIds.length,
      proposalIds: amlGapIds.slice(0, 20),
    });
  }

  if (accountsGapIds.length > 0) {
    alerts.push({
      id: 'reg-COMPANIES-ACT-FILING',
      ruleCode: 'COMPANIES-ACT-FILING',
      title: 'Companies House filing deadlines',
      summary:
        'Limited company proposals should reference annual accounts filing. Some active proposals have no accounts service.',
      severity: 'info',
      affectedProposalCount: accountsGapIds.length,
      proposalIds: accountsGapIds.slice(0, 20),
    });
  }

  return {
    alerts,
    scannedAt: new Date().toISOString(),
    proposalCount: proposals.length,
  };
}