/** Maps tenant professionalBody settings to engagement clause library tags. */

export const REGULATORY_BODY_CODES = [
  'ACCA',
  'ICAEW',
  'ICAS',
  'CIMA',
  'AAT',
  'ATT',
  'CIOT',
] as const;

export type RegulatoryBodyCode = (typeof REGULATORY_BODY_CODES)[number];

export const REGULATORY_BODY_CLAUSE_TAGS = REGULATORY_BODY_CODES.map(
  (code) => `_${code.toLowerCase()}`
) as readonly string[];

export function professionalBodyToClauseTag(body?: string | null): string | undefined {
  if (!body?.trim()) return undefined;
  const normalised = body.trim().toUpperCase();
  if (!REGULATORY_BODY_CODES.includes(normalised as RegulatoryBodyCode)) {
    return undefined;
  }
  return `_${normalised.toLowerCase()}`;
}

export function clauseRegulatoryBodyTags(tags: string[]): string[] {
  return tags.filter((tag) => REGULATORY_BODY_CLAUSE_TAGS.includes(tag));
}

/** Universal clauses (no body tag) apply to all practices. */
export function clauseMatchesRegulatoryBody(
  clauseTags: string[],
  professionalBody?: string | null
): boolean {
  const bodyTags = clauseRegulatoryBodyTags(clauseTags);
  if (bodyTags.length === 0) return true;

  const requiredTag = professionalBodyToClauseTag(professionalBody);
  if (!requiredTag) return true;

  return bodyTags.includes(requiredTag);
}

export function regulatoryBodyLabel(body?: string | null): string | undefined {
  if (!body?.trim() || body.toUpperCase() === 'OTHER') return undefined;
  return body.trim().toUpperCase();
}
