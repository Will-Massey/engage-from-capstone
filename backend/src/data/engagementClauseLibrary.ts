/**
 * Firm-approved engagement letter clauses — AI selects from this library only.
 * IDs are stable for audit; bodies use UK English and professional register.
 * Clause packages: backend/data/engagement-clauses/ (ICAEW/ACCA-aligned)
 */

import { loadEngagementClausePackages } from './loadEngagementClauses.js';
import { clauseMatchesRegulatoryBody } from '../utils/professionalBodyClauses.js';

export { REGULATORY_BODY_CLAUSE_TAGS, professionalBodyToClauseTag } from '../utils/professionalBodyClauses.js';

export interface EngagementClause {
  id: string;
  title: string;
  tags: string[];
  body: string;
}

const FALLBACK_CLAUSES: EngagementClause[] = [
  {
    id: 'client-records',
    title: 'Client record-keeping',
    tags: ['_always'],
    body: `You are responsible for maintaining adequate accounting records for six years (HMRC requirement) and providing information promptly when requested.`,
  },
];

function mergeClauseLibraries(packages: EngagementClause[]): EngagementClause[] {
  const byId = new Map<string, EngagementClause>();
  for (const clause of [...FALLBACK_CLAUSES, ...packages]) {
    byId.set(clause.id, clause);
  }
  return Array.from(byId.values());
}

export const ENGAGEMENT_CLAUSE_LIBRARY: EngagementClause[] = mergeClauseLibraries(
  loadEngagementClausePackages()
);

export interface ClauseSelectionOptions {
  /** Tenant professional body — filters body-specific clauses (ACCA, ICAEW, ATT, etc.) */
  professionalBody?: string | null;
}

export function selectClausesForServices(
  services: Array<{ name: string; tags?: string }>,
  options?: ClauseSelectionOptions
): EngagementClause[] {
  const professionalBody = options?.professionalBody;
  const selected = new Map<string, EngagementClause>();

  const includeClause = (clause: EngagementClause): boolean =>
    clauseMatchesRegulatoryBody(clause.tags, professionalBody);

  for (const clause of ENGAGEMENT_CLAUSE_LIBRARY) {
    if (clause.tags.includes('_always') && includeClause(clause)) {
      selected.set(clause.id, clause);
    }
  }

  const allTags = services.flatMap((s) => {
    const fromField = (s.tags || '')
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const nameTokens = s.name.toLowerCase().split(/\s+/);
    return [...fromField, ...nameTokens];
  });

  for (const clause of ENGAGEMENT_CLAUSE_LIBRARY) {
    if (clause.tags.includes('_always')) continue;
    if (!includeClause(clause)) continue;
    const matches = clause.tags.some((tag) =>
      allTags.some((t) => t.includes(tag) || tag.includes(t))
    );
    if (matches) selected.set(clause.id, clause);
  }

  return Array.from(selected.values());
}

export function assembleEngagementLetterFromClauses(
  practiceName: string,
  clientName: string,
  clauses: EngagementClause[],
  feesSummary: string,
  periodLabel: string
): string {
  const scopeSection = clauses
    .filter((c) => !c.tags.includes('_always'))
    .map((c, i) => `### ${i + 1}. ${c.title}\n\n${c.body}`)
    .join('\n\n');

  const termsSection = clauses
    .filter((c) => c.tags.includes('_always'))
    .map((c) => `### ${c.title}\n\n${c.body}`)
    .join('\n\n');

  return `# Letter of engagement

**${practiceName}** — professional accountancy services for **${clientName}**

**Period:** ${periodLabel}

---

## Scope of services

${scopeSection || '_Services as detailed in your accepted proposal._'}

---

## Fees

${feesSummary}

---

## Terms

${termsSection}

---

*This letter supplements your proposal and terms of business. Please retain a copy for your records.*`;
}
