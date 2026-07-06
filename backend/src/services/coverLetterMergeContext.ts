/**
 * Build cover-letter merge fields from tenant settings — no fabricated credentials or tenure.
 */
import { prisma } from '../config/database.js';

export interface CoverLetterMergeInput {
  clientName?: string;
  companyName?: string;
  servicesSummary?: string;
  discussionDate?: string;
  tenantName?: string;
  senderName?: string;
  senderPosition?: string;
  monthlyTotal?: string;
  serviceCount?: number | string;
  proposalReference?: string;
  proposalTitle?: string;
}

export type CoverLetterMergeFields = CoverLetterMergeInput & {
  firmCredentials?: string;
  firmExperience?: string;
  sectorOrRegion?: string;
  keyOutcome?: string;
  professionalBody?: string;
};

function parseTenantSettings(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function professionalBodyLabel(body?: string | null): string | undefined {
  if (!body || body === 'OTHER') return undefined;
  return body;
}

export function firmCredentialsFromSettings(settings: Record<string, unknown>): string | undefined {
  const body = professionalBodyLabel(
    typeof settings.professionalBody === 'string' ? settings.professionalBody : undefined
  );
  if (!body) return undefined;
  return `${body}-regulated practice`;
}

/** Only use explicit yearsExperience from settings — never invent tenure. */
export function firmExperienceFromSettings(settings: Record<string, unknown>): string | undefined {
  const years = settings.yearsExperience;
  if (typeof years === 'number' && years > 0) {
    return `${years} years`;
  }
  if (typeof years === 'string' && years.trim()) {
    return years.trim();
  }
  return undefined;
}

export async function buildCoverLetterMergeFields(
  tenantId: string,
  input: CoverLetterMergeInput
): Promise<CoverLetterMergeFields> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, settings: true },
  });

  const settings = parseTenantSettings(tenant?.settings || '{}');
  const professionalBody = professionalBodyLabel(
    typeof settings.professionalBody === 'string' ? settings.professionalBody : undefined
  );

  return {
    ...input,
    tenantName: input.tenantName || tenant?.name,
    professionalBody,
    firmCredentials: firmCredentialsFromSettings(settings),
    firmExperience: firmExperienceFromSettings(settings),
    sectorOrRegion:
      typeof settings.sectorOrRegion === 'string' && settings.sectorOrRegion.trim()
        ? settings.sectorOrRegion.trim()
        : undefined,
    keyOutcome: undefined,
  };
}

/** Remove paragraphs that still contain unfilled {{placeholders}} after merge. */
export function stripUnresolvedMergeParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .filter((block) => !/\{\{[a-zA-Z]+\}\}/.test(block))
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
