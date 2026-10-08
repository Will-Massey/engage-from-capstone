/**
 * How a practice tells two entities apart when they share a contact email.
 * The legal name is the field staff fill in. Company number and entity type
 * are shown when the record has them.
 */

export interface EntityIdentity {
  name?: string | null;
  companyNumber?: string | null;
  companyType?: string | null;
}

export function formatCompanyTypeLabel(companyType?: string | null): string {
  if (!companyType) return '';
  return companyType
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Legal name, then entity type and company number when present. */
export function formatEntityLabel(entity: EntityIdentity): string {
  const name = entity.name?.trim() || 'Client';
  const type = formatCompanyTypeLabel(entity.companyType);
  const number = entity.companyNumber?.trim();
  const extras = [type, number ? `No. ${number}` : ''].filter(Boolean);
  return extras.length ? `${name} (${extras.join(', ')})` : name;
}

export function proposalSubjectLine(input: {
  kind?: 'proposal' | 'reminder' | 'acceptance';
  clientName: string;
  companyNumber?: string | null;
  reference: string;
  title: string;
}): string {
  const legalName = input.clientName.trim() || 'Client';
  const who = input.companyNumber?.trim()
    ? `${legalName} (${input.companyNumber.trim()})`
    : legalName;
  const prefix =
    input.kind === 'reminder' ? 'Reminder' : input.kind === 'acceptance' ? 'Accepted' : 'Proposal';
  return `${prefix}: ${who} - ${input.reference} - ${input.title}`;
}

/**
 * Keep a drafted subject, but append the company number and quote reference
 * when they are missing so two emails to the same inbox stay distinct.
 */
export function distinguishEmailSubject(
  drafted: string | undefined | null,
  fallback: string,
  reference: string,
  companyNumber?: string | null
): string {
  const ai = drafted?.trim();
  if (!ai) return fallback;
  const number = companyNumber?.trim() || '';
  const hasRef = reference ? ai.includes(reference) : true;
  const hasNumber = !number || ai.includes(number);
  if (hasRef && hasNumber) return ai;
  const extra = [!hasNumber ? number : '', !hasRef ? reference : ''].filter(Boolean).join(', ');
  return extra ? `${ai} (${extra})` : ai;
}
