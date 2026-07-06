import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.proposal.groupBy({ by: ['status'], _count: true });
  console.log('Status breakdown:', JSON.stringify(rows, null, 2));
  const withAcceptedAt = await prisma.proposal.findMany({
    where: { acceptedAt: { not: null } },
    select: { reference: true, status: true, acceptedAt: true },
  });
  console.log('With acceptedAt:', JSON.stringify(withAcceptedAt, null, 2));

  const all = await prisma.proposal.findMany({
    select: { reference: true, status: true, acceptedAt: true, sentAt: true, viewedAt: true },
    orderBy: { reference: 'asc' },
  });
  console.log('All proposals:', JSON.stringify(all, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
