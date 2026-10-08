/**
 * Client identity when several entities share one contact email.
 * Uniqueness is the practice plus the entity (legal name, company number,
 * or an accounting-system id), never the email on its own.
 */

export interface ExistingClientIdentity {
  id: string;
  name: string;
  contactEmail?: string | null;
  companyNumber?: string | null;
  tags?: string | null;
}

export type SameEntityReason = 'linked_external_id' | 'duplicate_company_number' | 'duplicate_name';

export function normalizeEntityName(name: string | null | undefined): string {
  return (name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function tagList(tags: string | null | undefined): string[] {
  return (tags || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/**
 * Find the existing client that is the same legal entity.
 * A shared email is not a match. Returns null when this is a new entity.
 */
export function findSameEntity(
  existing: ExistingClientIdentity[],
  incoming: {
    name?: string | null;
    companyNumber?: string | null;
    externalTag?: string | null;
  }
): { client: ExistingClientIdentity; reason: SameEntityReason } | null {
  const externalTag = incoming.externalTag?.trim();
  if (externalTag) {
    const linked = existing.find((client) => tagList(client.tags).includes(externalTag));
    if (linked) return { client: linked, reason: 'linked_external_id' };
  }

  const companyNumber = incoming.companyNumber?.trim().toLowerCase();
  if (companyNumber) {
    const byNumber = existing.find(
      (client) => (client.companyNumber || '').trim().toLowerCase() === companyNumber
    );
    if (byNumber) return { client: byNumber, reason: 'duplicate_company_number' };
  }

  const name = normalizeEntityName(incoming.name);
  if (!name) return null;

  const byName = existing.find((client) => normalizeEntityName(client.name) === name);
  if (!byName) return null;

  const existingNumber = byName.companyNumber?.trim().toLowerCase();
  if (companyNumber && existingNumber && existingNumber !== companyNumber) {
    return null;
  }
  return { client: byName, reason: 'duplicate_name' };
}

/**
 * Inbound mail and other email-only lookups may attach a client only when
 * exactly one entity uses that address. Several matches stay unlinked.
 */
export function selectUniqueClientMatch<T extends { id: string }>(matches: T[]): T | null {
  return matches.length === 1 ? matches[0] : null;
}

export interface StripePeer {
  id: string;
  createdAt: Date;
  stripeCustomerId: string | null;
}

export type StripeCustomerStrategy =
  | { mode: 'stored'; customerId: string }
  | { mode: 'legacy_email'; customerEmail: string }
  | { mode: 'dedicated' };

/**
 * Stripe Checkout for the original entity keeps customer_email, which is how
 * an existing quote already collects payment. A later entity that reuses the
 * email gets its own Stripe customer, keyed by the Engage client id.
 */
export function chooseStripeCustomerStrategy(input: {
  clientId: string;
  contactEmail: string;
  peers: StripePeer[];
}): StripeCustomerStrategy {
  const self = input.peers.find((peer) => peer.id === input.clientId);
  if (self?.stripeCustomerId) {
    return { mode: 'stored', customerId: self.stripeCustomerId };
  }

  const oldest = [...input.peers].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  if (!oldest || input.peers.length <= 1 || oldest.id === input.clientId) {
    return { mode: 'legacy_email', customerEmail: input.contactEmail };
  }

  return { mode: 'dedicated' };
}

/**
 * Accounting contact match.
 * A stored id or the same legal name wins. Email alone never selects a
 * contact that already has a different legal name. One email hit with no
 * name is the contact an existing quote already used.
 */
export function pickAccountingContactId(input: {
  clientName: string;
  email?: string | null;
  linkedId?: string | null;
  emailMatches?: Array<{ id: string; name?: string | null; email?: string | null }>;
  nameMatches?: Array<{ id: string; name?: string | null }>;
}): string | undefined {
  if (input.linkedId) return input.linkedId;

  const wanted = normalizeEntityName(input.clientName);
  const nameHit = (input.nameMatches || []).find(
    (contact) => contact.name && normalizeEntityName(contact.name) === wanted && contact.id
  );
  if (nameHit) return nameHit.id;

  const email = input.email?.trim().toLowerCase();
  if (!email || !wanted) return undefined;

  const emailHits = (input.emailMatches || []).filter(
    (contact) => (contact.email || '').trim().toLowerCase() === email && contact.id
  );

  const sameName = emailHits.find(
    (contact) => contact.name && normalizeEntityName(contact.name) === wanted
  );
  if (sameName) return sameName.id;

  // One contact on this email, with no name stored, is the existing record
  // Engage already used. A named contact for a different company is not.
  if (emailHits.length === 1 && !emailHits[0].name?.trim()) {
    return emailHits[0].id;
  }

  return undefined;
}
