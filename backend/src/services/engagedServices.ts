/**
 * Engaged services per client — canonical derivation is accepted proposals
 * (status ACCEPTED) → ProposalService lines, with the catalog category carried
 * through when the line was built from a ServiceTemplate. Used by the R5.2
 * regulatory rule engine to test filing/payroll coverage.
 */
import { prisma } from '../config/database.js';
import type { EngagedService } from './regulatoryRules.js';

export type { EngagedService };

/**
 * Batch variant: engaged services for many clients in one query.
 * Returns a map of clientId → engaged service lines (deduplicated by name).
 */
export async function getEngagedServicesByClient(
  tenantId: string,
  clientIds?: string[]
): Promise<Map<string, EngagedService[]>> {
  const proposals = await prisma.proposal.findMany({
    where: {
      tenantId,
      status: 'ACCEPTED',
      ...(clientIds?.length ? { clientId: { in: clientIds } } : {}),
    },
    select: {
      clientId: true,
      services: {
        select: {
          name: true,
          serviceTemplate: { select: { category: true } },
        },
      },
    },
  });

  const byClient = new Map<string, EngagedService[]>();
  const seen = new Map<string, Set<string>>();

  for (const proposal of proposals) {
    let list = byClient.get(proposal.clientId);
    let names = seen.get(proposal.clientId);
    if (!list || !names) {
      list = [];
      names = new Set();
      byClient.set(proposal.clientId, list);
      seen.set(proposal.clientId, names);
    }
    for (const service of proposal.services) {
      const key = service.name.trim().toLowerCase();
      if (!key || names.has(key)) continue;
      names.add(key);
      list.push({
        name: service.name,
        category: service.serviceTemplate?.category ?? null,
      });
    }
  }

  return byClient;
}

/** Engaged service lines for a single client (accepted proposals only). */
export async function getEngagedServiceNames(
  tenantId: string,
  clientId: string
): Promise<EngagedService[]> {
  const byClient = await getEngagedServicesByClient(tenantId, [clientId]);
  return byClient.get(clientId) ?? [];
}
