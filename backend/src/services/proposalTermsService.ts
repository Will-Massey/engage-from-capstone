/**
 * Build proposal T&Cs from Engage defaults, tenant custom terms, or engagement clause library.
 */
import { prisma } from '../config/database.js';
import { selectClausesForServices } from '../data/engagementClauseLibrary.js';
import { regulatoryBodyLabel } from '../utils/professionalBodyClauses.js';
import { generateProposalTerms } from '../templates/ukEngagementLetter.js';
import {
  formatPaymentTerms,
  getProposalSettings,
  type ProposalSettings,
} from '../utils/tenantProposalSettings.js';
import { applyTermsPlaceholders, stripMarkdownHeadings } from '../utils/termsPlainText.js';

export interface TermsServiceInput {
  name: string;
  tags?: string | null;
}

export type TermsSource = 'engage_default' | 'custom';

export interface TenantTermsConfig {
  termsSource: TermsSource;
  customTerms: string | null;
}

function parseTenantSettings(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return raw as Record<string, unknown>;
}

export function getTenantTermsConfig(tenantSettingsJson?: string | null): TenantTermsConfig {
  try {
    const parsed = JSON.parse(tenantSettingsJson || '{}');
    const p = (parsed.proposals || {}) as Record<string, unknown>;
    const source = p.termsSource === 'custom' ? 'custom' : 'engage_default';
    const custom =
      typeof p.customTerms === 'string' && p.customTerms.trim() ? p.customTerms.trim() : null;
    return {
      termsSource: source === 'custom' && custom ? 'custom' : 'engage_default',
      customTerms: custom,
    };
  } catch {
    return { termsSource: 'engage_default', customTerms: null };
  }
}

function cancellationNoticeLabel(days: number): string {
  if (days === 1) return "1 day's";
  if (days < 30) return `${days} days'`;
  if (days === 30) return "30 days'";
  if (days % 30 === 0) {
    const months = days / 30;
    return months === 1 ? "1 month's" : `${months} months'`;
  }
  return `${days} days'`;
}

export function buildProposalTermsText(
  practiceName: string,
  proposalSettings: ProposalSettings,
  governingLaw: string,
  services: TermsServiceInput[],
  options?: { includeServiceAppendix?: boolean; professionalBody?: string | null }
): string {
  const paymentLabel = formatPaymentTerms(proposalSettings.defaultPaymentTermsDays);
  const cancellationLabel = cancellationNoticeLabel(proposalSettings.cancellationNoticeDays);

  const base = stripMarkdownHeadings(
    applyTermsPlaceholders(generateProposalTerms(), {
      practiceName,
      paymentTermsLabel: paymentLabel,
      governingLaw,
      cancellationNotice: cancellationLabel,
    })
  );

  if (options?.includeServiceAppendix === false || !services.length) {
    return base;
  }

  const clauses = selectClausesForServices(
    services.map((s) => ({ name: s.name, tags: s.tags || undefined })),
    { professionalBody: options?.professionalBody }
  );
  const serviceSpecific = clauses.filter((c) => !c.tags.includes('_always'));
  if (!serviceSpecific.length) return base;

  const appendix = serviceSpecific.map((c) => `${c.title}\n\n${c.body}`).join('\n\n');

  return `${base}\n\n---\n\nSERVICE-SPECIFIC TERMS\n\n${appendix}`;
}

export function buildCustomProposalTerms(
  customTemplate: string,
  practiceName: string,
  proposalSettings: ProposalSettings,
  governingLaw: string
): string {
  const paymentLabel = formatPaymentTerms(proposalSettings.defaultPaymentTermsDays);
  const cancellationLabel = cancellationNoticeLabel(proposalSettings.cancellationNoticeDays);
  return stripMarkdownHeadings(
    applyTermsPlaceholders(customTemplate, {
      practiceName,
      paymentTermsLabel: paymentLabel,
      governingLaw,
      cancellationNotice: cancellationLabel,
    })
  );
}

export async function resolveProposalTerms(
  tenantId: string,
  services: TermsServiceInput[]
): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, settings: true },
  });

  const settings = parseTenantSettings(tenant?.settings);
  const proposalSettings = getProposalSettings(tenant?.settings);
  const governingLaw = (settings.governingLaw as string | undefined)?.trim() || 'England and Wales';
  const practiceName = tenant?.name || 'Your practice';
  const professionalBody = regulatoryBodyLabel(
    typeof settings.professionalBody === 'string' ? settings.professionalBody : undefined
  );
  const termsConfig = getTenantTermsConfig(tenant?.settings);

  if (termsConfig.termsSource === 'custom' && termsConfig.customTerms) {
    return buildCustomProposalTerms(
      termsConfig.customTerms,
      practiceName,
      proposalSettings,
      governingLaw
    );
  }

  return buildProposalTermsText(practiceName, proposalSettings, governingLaw, services, {
    professionalBody,
  });
}

/** Default Engage template for settings editor (placeholders preserved for editing). */
export function getEngageDefaultTermsTemplate(): string {
  return generateProposalTerms();
}

export async function previewEngageDefaultTermsForTenant(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, settings: true },
  });
  const settings = parseTenantSettings(tenant?.settings);
  const proposalSettings = getProposalSettings(tenant?.settings);
  const governingLaw = (settings.governingLaw as string | undefined)?.trim() || 'England and Wales';

  return buildProposalTermsText(
    tenant?.name || 'Your practice',
    proposalSettings,
    governingLaw,
    [],
    { includeServiceAppendix: false }
  );
}
