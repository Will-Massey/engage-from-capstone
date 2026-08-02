/**
 * Seed several accepted-proposal jobs across board columns for demos.
 * Run: npx tsx scripts/seed-practice-jobs.ts
 */
import { prisma } from '../src/config/database.js';
import { spawnJobForProposal } from '../src/services/jobSpawnService.js';

const COLUMNS = [
  'REQUEST_RECORDS',
  'RECORDS_RECEIVED',
  'IN_PROGRESS',
  'HELP_NEEDED',
  'IN_REVIEW',
] as const;

async function main() {
  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!tenant) throw new Error('No tenant');

  const proposals = await prisma.proposal.findMany({
    where: { tenantId: tenant.id },
    include: { services: true, client: true },
    orderBy: { createdAt: 'asc' },
    take: 8,
  });

  let i = 0;
  for (const p of proposals) {
    await prisma.proposal.update({
      where: { id: p.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });
    const r = await spawnJobForProposal(p.id);
    if (!r) continue;
    const col = COLUMNS[i % COLUMNS.length];
    const due = new Date();
    due.setDate(due.getDate() + (i % 3 === 0 ? -2 : 5 + i * 3));
    await prisma.job.update({
      where: { id: r.jobId },
      data: {
        boardColumn: col,
        dueAt: due,
        deadlineKind: i % 2 === 0 ? 'STATUTORY' : 'INTERNAL',
      },
    });
    console.log(r.jobId, col, p.client.name, r.created ? 'new' : 'exists');
    i += 1;
  }

  const count = await prisma.job.count({ where: { tenantId: tenant.id } });
  console.log('jobs total', count);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
