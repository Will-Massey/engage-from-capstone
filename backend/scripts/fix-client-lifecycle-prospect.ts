/**
 * Reset clients stuck at PROPOSAL_ACCEPTED without a signed proposal.
 * Run after migration 20260701220000_client_lifecycle_prospect.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const clients = await prisma.client.findMany({
    where: { lifecycleStage: 'PROPOSAL_ACCEPTED' },
    select: {
      id: true,
      name: true,
      proposals: { where: { status: 'ACCEPTED' }, select: { id: true }, take: 1 },
    },
  });

  const toReset = clients.filter((c) => c.proposals.length === 0);
  if (toReset.length === 0) {
    console.log('No clients need lifecycle reset.');
    return;
  }

  await prisma.client.updateMany({
    where: { id: { in: toReset.map((c) => c.id) } },
    data: { lifecycleStage: 'PROSPECT' },
  });

  console.log(
    `Reset ${toReset.length} client(s) to PROSPECT:`,
    toReset.map((c) => c.name).join(', ')
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());