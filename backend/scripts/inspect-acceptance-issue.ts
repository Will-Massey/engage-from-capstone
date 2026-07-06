import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const statusRows = await prisma.proposal.groupBy({ by: ['status'], _count: true });
  console.log('Proposal status breakdown:', statusRows);

  const accepted = await prisma.proposal.findMany({
    where: { OR: [{ status: 'ACCEPTED' }, { acceptedAt: { not: null } }] },
    select: {
      reference: true,
      status: true,
      acceptedAt: true,
      sentAt: true,
      viewedAt: true,
      _count: { select: { signatures: true } },
    },
  });
  console.log('Accepted or acceptedAt set:', accepted);

  const clientStages = await prisma.client.groupBy({ by: ['lifecycleStage'], _count: true });
  console.log('Client lifecycle stages:', clientStages);

  const recentLogs = await prisma.activityLog.findMany({
    where: {
      OR: [
        { action: { contains: 'ACCEPT', mode: 'insensitive' } },
        { action: { contains: 'SIGN', mode: 'insensitive' } },
        { action: 'PROPOSAL_BULK_REVERT_ACCEPTED' },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { action: true, description: true, createdAt: true, entityId: true },
  });
  console.log('Recent acceptance-related activity:', recentLogs);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
