import { prisma } from '../src/config/database.js';
import { spawnJobForProposal } from '../src/services/jobSpawnService.js';

async function main() {
  const p = await prisma.proposal.findFirst({ include: { services: true } });
  if (!p) {
    console.log('no proposal');
    process.exit(1);
  }
  await prisma.proposal.update({
    where: { id: p.id },
    data: { status: 'ACCEPTED', acceptedAt: new Date() },
  });
  const r = await spawnJobForProposal(p.id);
  console.log('spawn1', JSON.stringify(r));
  const job = await prisma.job.findFirst({
    include: { phases: { include: { checklistItems: true } } },
  });
  console.log(
    'job',
    job?.reference,
    '|',
    job?.title,
    '| phases',
    job?.phases.length,
    '| checks',
    job?.phases.reduce((a, ph) => a + ph.checklistItems.length, 0)
  );
  const r2 = await spawnJobForProposal(p.id);
  console.log('spawn2 idempotent', JSON.stringify(r2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
