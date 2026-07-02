/**
 * Build proposal T&Cs from firm engagement clause library + standard terms template.
 */
import { prisma } from '../config/database.js';
import { selectClausesForServices } from '../data/engagementClauseLibrary.js';
import { generateProposalTerms } from '../templates/ukEngagementLetter.js';
import { formatPaymentTerms, getProposalSettings } from '../utils/tenantProposalSettings.js';

export interface TermsServiceInput {
  name: string;
  tags?: string | null;
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

export function buildProposalTermsText(
  practiceName: string,
  paymentTermsDays: number,
  governingLaw: string,
  services: TermsServiceInput[]
): string {
  const paymentLabel = formatPaymentTerms(paymentTermsDays);
  const base = generateProposalTerms()
    .replace(/\{\{PRACTICE_NAME\}\}/g, practiceName)
    .replace(/within 30 days/gi, `within ${paymentLabel}`)
    .replace(/the laws of England and Wales/gi, `the laws of ${governingLaw}`);

  const clauses = selectClausesForServices(
    services.map((s) => ({ name: s.name, tags: s.tags || undefined }))
  );

  const serviceSpecific = clauses.filter((c) => !c.tags.includes('_always'));
  if (!serviceSpecific.length) return base;

  const appendix = serviceSpecific
    .map((c) => `### ${c.title}\n\n${c.body}`)
    .join('\n\n');

  return `${base}\n\n---\n\n## Service-specific terms\n\n${appendix}`;
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
  const governingLaw =
    (settings.governingLaw as string | undefined)?.trim() || 'England and Wales';

  return buildProposalTermsText(
    tenant?.name || 'Your practice',
    proposalSettings.defaultPaymentTermsDays,
    governingLaw,
    services
  );
}